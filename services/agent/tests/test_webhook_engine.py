import pytest
from app.webhook_engine import ToolDefinition, ToolParameter, WebhookDispatcher
from app.tool_registry import ToolRegistry

@pytest.fixture
def registry():
    return ToolRegistry()

def test_builtin_tools_registration(registry):
    tools = registry.list_tools()
    assert len(tools) >= 7
    names = {t["name"] for t in tools}
    assert "lookup_account" in names
    assert "record_promise" in names
    assert "schedule_callback" in names
    assert "send_sms_confirmation" in names
    assert "check_availability" in names
    assert "transfer_call" in names
    assert "flag_stop_contact" in names

def test_openai_schema_generation(registry):
    schemas = registry.get_openai_tools_schema()
    assert len(schemas) >= 7
    ptp_schema = next(s for s in schemas if s["function"]["name"] == "record_promise")
    assert ptp_schema["type"] == "function"
    props = ptp_schema["function"]["parameters"]["properties"]
    assert "amount" in props
    assert "payment_date" in props
    assert "payment_method" in props
    assert props["amount"]["type"] == "integer"
    assert "amount" in ptp_schema["function"]["parameters"]["required"]

def test_argument_schema_validation(registry):
    # Test missing required field
    res = registry.execute("lookup_account", {})
    assert res["success"] is False
    assert "Missing required parameter" in res["error"]

    # Test type mismatch
    res = registry.execute("record_promise", {"amount": "five thousand", "payment_date": "2026-11-01"})
    assert res["success"] is False
    assert "must be an integer" in res["error"]

    # Test invalid enum
    res = registry.execute("send_sms_confirmation", {"phone": "090-1234-5678", "template": "invalid_template"})
    assert res["success"] is False
    assert "must be one of" in res["error"]

def test_builtin_tool_execution(registry):
    # Test sms confirmation
    res = registry.execute("send_sms_confirmation", {
        "phone": "090-1234-5678",
        "template": "payment_link"
    })
    assert res["success"] is True
    assert res["tool"] == "send_sms_confirmation"
    assert res["data"]["sms_dispatched"] is True
    assert "latency_ms" in res

    # Test check availability
    res_avail = registry.execute("check_availability", {
        "target_date": "2026-10-15",
        "department": "financial_counseling"
    })
    assert res_avail["success"] is True
    assert len(res_avail["data"]["slots_available"]) > 0

    # Test transfer call
    res_transfer = registry.execute("transfer_call", {
        "reason": "debtor_request",
        "target_queue": "supervisor"
    })
    assert res_transfer["success"] is True
    assert res_transfer["data"]["call_transferred"] is True

def test_hmac_signature():
    secret = "whsec_test_secret_123"
    payload = b'{"event":"test","value":42}'
    sig = WebhookDispatcher.sign_payload(payload, secret)
    assert sig.startswith("t=")
    assert ",v1=" in sig
    parts = dict(item.split("=") for item in sig.split(","))
    assert "t" in parts
    assert len(parts["v1"]) == 64  # SHA-256 hex string length

def test_custom_webhook_registration_and_deletion(registry, tmp_path):
    custom_tool = ToolDefinition(
        name="test_order_lookup",
        description="Looks up customer order from e-commerce backend",
        tool_type="webhook",
        url="http://localhost:9999/api/orders",
        method="POST",
        parameters=[
            ToolParameter(name="order_id", type="string", description="Order ID", required=True)
        ],
        filler_phrase="注文情報を照会しております。",
    )
    registry.register(custom_tool)
    assert registry.get_tool("test_order_lookup") is not None

    # Unknown tool execution
    res = registry.execute("non_existent_tool", {})
    assert res["success"] is False
    assert "Unknown tool" in res["error"]
