"""
Central Tool & Webhook Registry for Voice AI Pipeline.
Maintains built-in enterprise tools, registers custom user webhooks,
validates incoming parameters, and executes tools with latency tracking.
"""

import os
import json
import time
from typing import Dict, Any, List, Optional
from .webhook_engine import ToolDefinition, ToolParameter, WebhookDispatcher
from .mock_crm.crm import crm

CONFIG_DIR = os.path.join(os.path.dirname(__file__), "..", "config")
CUSTOM_TOOLS_FILE = os.path.join(CONFIG_DIR, "custom_tools.json")

class ToolRegistry:
    def __init__(self):
        self._tools: Dict[str, ToolDefinition] = {}
        self._register_builtins()
        self._load_custom_tools()

    def _register_builtins(self):
        """Registers built-in enterprise voice operations tools."""
        # 1. lookup_account
        self.register(
            ToolDefinition(
                name="lookup_account",
                description="Looks up customer debt profile, outstanding balance, due date, and approved negotiation terms.",
                tool_type="builtin",
                filler_phrase="お調べいたしますので、少々お待ちください。",
                parameters=[
                    ToolParameter(
                        name="debtor_id",
                        type="string",
                        description="Customer identifier, e.g. deb_001",
                        required=True,
                    ),
                ],
            )
        )

        # 2. record_promise
        self.register(
            ToolDefinition(
                name="record_promise",
                description="Records an agreed promise to pay (PTP) with confirmation amount, due date, and payment method.",
                tool_type="builtin",
                filler_phrase="お約束内容を登録しております。",
                parameters=[
                    ToolParameter(
                        name="amount",
                        type="integer",
                        description="Agreed repayment amount in Japanese Yen (positive number)",
                        required=True,
                    ),
                    ToolParameter(
                        name="payment_date",
                        type="string",
                        description="Scheduled payment date in ISO format YYYY-MM-DD (must be a future date)",
                        required=True,
                    ),
                    ToolParameter(
                        name="payment_method",
                        type="string",
                        description="Payment channel: bank_transfer, convenience_store, or direct_debit",
                        required=False,
                        enum=["bank_transfer", "convenience_store", "direct_debit"],
                    ),
                ],
            )
        )

        # 3. schedule_callback
        self.register(
            ToolDefinition(
                name="schedule_callback",
                description="Schedules a follow-up callback appointment with the customer.",
                tool_type="builtin",
                filler_phrase="折り返しのお約束日時を確認しております。",
                parameters=[
                    ToolParameter(
                        name="callback_time",
                        type="string",
                        description="Requested callback date/time description (e.g. 明日14時, 2026-10-10 14:00)",
                        required=True,
                    ),
                    ToolParameter(
                        name="phone",
                        type="string",
                        description="Alternative phone number to call back, if specified",
                        required=False,
                    ),
                ],
            )
        )

        # 4. send_sms_confirmation
        self.register(
            ToolDefinition(
                name="send_sms_confirmation",
                description="Dispatches an automated SMS confirmation message with account details, payment portal link, or booking reference.",
                tool_type="builtin",
                filler_phrase="確認ショートメッセージをお送りいたします。",
                parameters=[
                    ToolParameter(
                        name="phone",
                        type="string",
                        description="Destination mobile phone number",
                        required=True,
                    ),
                    ToolParameter(
                        name="template",
                        type="string",
                        description="SMS template type",
                        required=True,
                        enum=["payment_link", "appointment_confirmation", "contact_info"],
                    ),
                ],
            )
        )

        # 5. check_availability
        self.register(
            ToolDefinition(
                name="check_availability",
                description="Checks real-time availability slots for human specialist consultation or appointment booking.",
                tool_type="builtin",
                filler_phrase="担当者の空き状況をお調べしております。",
                parameters=[
                    ToolParameter(
                        name="target_date",
                        type="string",
                        description="Date to check availability for (YYYY-MM-DD)",
                        required=True,
                    ),
                    ToolParameter(
                        name="department",
                        type="string",
                        description="Specialist department: financial_counseling, dispute_resolution, customer_service",
                        required=False,
                        enum=["financial_counseling", "dispute_resolution", "customer_service"],
                    ),
                ],
            )
        )

        # 6. transfer_call
        self.register(
            ToolDefinition(
                name="transfer_call",
                description="Transfers the live call to a human supervisor, dispute resolution agent, or external PSTN number.",
                tool_type="builtin",
                filler_phrase="担当者にお電話をお繋ぎいたします。少々お待ちください。",
                parameters=[
                    ToolParameter(
                        name="reason",
                        type="string",
                        description="Reason for transfer: debtor_request, complex_negotiation, dispute, hardship",
                        required=True,
                    ),
                    ToolParameter(
                        name="target_queue",
                        type="string",
                        description="Target queue or extension: supervisor, specialist, tier2",
                        required=False,
                        enum=["supervisor", "specialist", "tier2"],
                    ),
                ],
            )
        )

        # 7. flag_stop_contact
        self.register(
            ToolDefinition(
                name="flag_stop_contact",
                description="Immediately places debtor on suppress/do-not-call list upon legal cease request.",
                tool_type="builtin",
                parameters=[
                    ToolParameter(
                        name="reason",
                        type="string",
                        description="Cease reason: debtor_revocation, attorney_representation, bankruptcy",
                        required=True,
                    ),
                ],
            )
        )

    def register(self, tool: ToolDefinition):
        self._tools[tool.name] = tool

    def get_tool(self, name: str) -> Optional[ToolDefinition]:
        return self._tools.get(name)

    def list_tools(self) -> List[Dict[str, Any]]:
        return [t.to_dict() for t in self._tools.values()]

    def get_openai_tools_schema(self) -> List[Dict[str, Any]]:
        return [t.to_openai_schema() for t in self._tools.values()]

    def _load_custom_tools(self):
        """Loads custom user webhooks from persistent config if available."""
        if not os.path.exists(CUSTOM_TOOLS_FILE):
            return
        try:
            with open(CUSTOM_TOOLS_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                for item in data.get("tools", []):
                    params = [
                        ToolParameter(
                            name=p["name"],
                            type=p.get("type", "string"),
                            description=p.get("description", ""),
                            required=p.get("required", True),
                            enum=p.get("enum"),
                        )
                        for p in item.get("parameters", [])
                    ]
                    tool = ToolDefinition(
                        name=item["name"],
                        description=item.get("description", ""),
                        tool_type="webhook",
                        url=item.get("url"),
                        method=item.get("method", "POST"),
                        headers=item.get("headers", {}),
                        timeout_ms=item.get("timeout_ms", 3000),
                        parameters=params,
                        filler_phrase=item.get("filler_phrase"),
                        secret_key=item.get("secret_key"),
                    )
                    self.register(tool)
        except Exception as e:
            print(f"[ToolRegistry] Error loading custom tools: {e}")

    def save_custom_tool(self, tool_def: ToolDefinition):
        """Saves a custom webhook to persistent storage."""
        self.register(tool_def)
        os.makedirs(CONFIG_DIR, exist_ok=True)
        custom_list = [
            t.to_dict()
            for t in self._tools.values()
            if t.tool_type == "webhook"
        ]
        with open(CUSTOM_TOOLS_FILE, "w", encoding="utf-8") as f:
            json.dump({"tools": custom_list}, f, indent=2, ensure_ascii=False)

    def delete_custom_tool(self, name: str) -> bool:
        if name in self._tools and self._tools[name].tool_type == "webhook":
            del self._tools[name]
            os.makedirs(CONFIG_DIR, exist_ok=True)
            custom_list = [
                t.to_dict()
                for t in self._tools.values()
                if t.tool_type == "webhook"
            ]
            with open(CUSTOM_TOOLS_FILE, "w", encoding="utf-8") as f:
                json.dump({"tools": custom_list}, f, indent=2, ensure_ascii=False)
            return True
        return False

    def validate_arguments(self, tool: ToolDefinition, arguments: Dict[str, Any]) -> Optional[str]:
        """Validates arguments against declared parameters schema."""
        for p in tool.parameters:
            if p.required and (p.name not in arguments or arguments[p.name] is None):
                return f"Missing required parameter '{p.name}'"
            if p.name in arguments and arguments[p.name] is not None:
                val = arguments[p.name]
                if p.type == "integer" and not isinstance(val, int):
                    return f"Parameter '{p.name}' must be an integer"
                if p.type == "number" and not isinstance(val, (int, float)):
                    return f"Parameter '{p.name}' must be a number"
                if p.type == "string" and not isinstance(val, str):
                    return f"Parameter '{p.name}' must be a string"
                if p.type == "boolean" and not isinstance(val, bool):
                    return f"Parameter '{p.name}' must be a boolean"
                if p.enum and val not in p.enum:
                    return f"Parameter '{p.name}' must be one of {p.enum}"
        return None

    def execute(
        self,
        name: str,
        arguments: Dict[str, Any],
        session_state: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Executes a registered tool (built-in or remote webhook).
        Measures execution latency and formats structured response.
        """
        tool = self.get_tool(name)
        if not tool:
            return {
                "success": False,
                "tool": name,
                "error": f"Unknown tool '{name}'",
                "latency_ms": 0,
            }

        # Schema validation
        val_error = self.validate_arguments(tool, arguments)
        if val_error:
            return {
                "success": False,
                "tool": name,
                "error": f"Schema validation error: {val_error}",
                "latency_ms": 0,
            }

        start_time = time.perf_counter()
        session_state = session_state or {}

        # If webhook, dispatch via WebhookDispatcher
        if tool.tool_type == "webhook":
            session_id = session_state.get("session_id", "test_session")
            res = WebhookDispatcher.execute_webhook(tool, arguments, session_id=session_id)
            res["tool"] = name
            return res

        # Built-in tool execution
        try:
            if name == "lookup_account":
                from .tools import lookup_account
                res = lookup_account(session_state, arguments["debtor_id"])
            elif name == "record_promise":
                from .tools import record_promise
                res = record_promise(
                    session_state,
                    arguments["amount"],
                    arguments["payment_date"],
                    arguments.get("payment_method", "bank_transfer"),
                )
            elif name == "schedule_callback":
                from .tools import schedule_callback
                res = schedule_callback(session_state, arguments["callback_time"], arguments.get("phone"))
            elif name == "send_sms_confirmation":
                phone = arguments["phone"]
                tmpl = arguments["template"]
                res = {
                    "success": True,
                    "sms_dispatched": True,
                    "phone": phone,
                    "template": tmpl,
                    "message_id": f"sms_{int(time.time()*1000)}",
                    "status": "SENT",
                }
            elif name == "check_availability":
                res = {
                    "success": True,
                    "target_date": arguments["target_date"],
                    "slots_available": ["10:00", "13:30", "15:00", "17:00"],
                    "department": arguments.get("department", "general"),
                }
            elif name == "transfer_call":
                from .tools import escalate
                res = escalate(session_state, arguments["reason"], details=f"Target: {arguments.get('target_queue', 'supervisor')}")
                res["call_transferred"] = True
                res["target_queue"] = arguments.get("target_queue", "supervisor")
            elif name == "flag_stop_contact":
                from .tools import flag_stop_contact
                res = flag_stop_contact(session_state, arguments["reason"])
            else:
                res = {"success": False, "error": f"Unimplemented builtin handler '{name}'"}

            latency_ms = int((time.perf_counter() - start_time) * 1000)
            return {
                "success": res.get("success", True),
                "tool": name,
                "data": res,
                "latency_ms": latency_ms,
            }
        except Exception as e:
            latency_ms = int((time.perf_counter() - start_time) * 1000)
            return {
                "success": False,
                "tool": name,
                "error": str(e),
                "latency_ms": latency_ms,
            }

# Singleton instance
tool_registry = ToolRegistry()
