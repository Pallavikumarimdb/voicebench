import React, { useEffect, useRef, useState, useMemo } from 'react';
import { WaveformData } from '../data/types.ts';
import { apiClient } from '../data/apiClient.ts';

interface TurnMarker {
  turnNumber: number;
  sec: number;
  speaker: 'user' | 'agent';
  label?: string;
}

interface AudioPlayerProps {
  callId: string;
  audioUrl?: string;
  downloadUrl?: string;
  turnMarkers?: TurnMarker[];
  activeSeekSec?: number | null;
  onTimeUpdate?: (currentSec: number) => void;
}

export const AudioPlayer: React.FC<AudioPlayerProps> = ({
  callId,
  audioUrl,
  downloadUrl,
  turnMarkers = [],
  activeSeekSec,
  onTimeUpdate,
}) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1.0);
  const [volume, setVolume] = useState(1.0);
  const [isMuted, setIsMuted] = useState(false);
  const [channelMode, setChannelMode] = useState<'both' | 'caller' | 'agent'>('both');
  const [waveform, setWaveform] = useState<WaveformData | null>(null);
  const [loadingWaveform, setLoadingWaveform] = useState(true);
  const [hoverSec, setHoverSec] = useState<number | null>(null);
  const [audioError, setAudioError] = useState<string | null>(null);

  // Web Audio Context for channel splitting/panning
  const audioCtxRef = useRef<AudioContext | null>(null);
  const pannerRef = useRef<StereoPannerNode | null>(null);
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);

  const effectiveAudioUrl = audioUrl || `/api/calls/${encodeURIComponent(callId)}/audio`;
  const effectiveDownloadUrl = downloadUrl || `/api/calls/${encodeURIComponent(callId)}/audio/download`;

  // Fetch waveform peaks from API
  useEffect(() => {
    let mounted = true;
    setLoadingWaveform(true);
    setAudioError(null);
    apiClient
      .getWaveform(callId)
      .then((data) => {
        if (mounted && data) {
          setWaveform(data);
          if (data.durationSec && (!duration || duration === 0)) {
            setDuration(data.durationSec);
          }
        }
      })
      .catch((err) => {
        console.warn('Failed to load waveform peaks:', err);
      })
      .finally(() => {
        if (mounted) setLoadingWaveform(false);
      });

    return () => {
      mounted = false;
    };
  }, [callId]);

  // Handle external seek requests (e.g. clicking a turn in CallInspector)
  useEffect(() => {
    if (activeSeekSec !== undefined && activeSeekSec !== null && audioRef.current) {
      audioRef.current.currentTime = activeSeekSec;
      setCurrentTime(activeSeekSec);
      if (!isPlaying) {
        audioRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
      }
    }
  }, [activeSeekSec]);

  // Setup Web Audio Stereo Panner for channel isolation
  const setupWebAudio = () => {
    if (!audioRef.current || audioCtxRef.current) return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const source = ctx.createMediaElementSource(audioRef.current);
      const panner = ctx.createStereoPanner();
      source.connect(panner);
      panner.connect(ctx.destination);
      audioCtxRef.current = ctx;
      pannerRef.current = panner;
      sourceNodeRef.current = source;
    } catch {
      // Browser autoplay policy or already connected
    }
  };

  // Update stereo pan when channelMode changes
  useEffect(() => {
    if (pannerRef.current) {
      if (channelMode === 'caller') {
        pannerRef.current.pan.value = -1.0; // Pan hard left
      } else if (channelMode === 'agent') {
        pannerRef.current.pan.value = 1.0; // Pan hard right
      } else {
        pannerRef.current.pan.value = 0.0; // Center / both
      }
    }
  }, [channelMode]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    setupWebAudio();
    if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current
        .play()
        .then(() => {
          setIsPlaying(true);
          setAudioError(null);
        })
        .catch((err) => {
          setAudioError('Playback failed: ' + err.message);
          setIsPlaying(false);
        });
    }
  };

  const seekRelative = (deltaSec: number) => {
    if (!audioRef.current) return;
    const target = Math.max(0, Math.min(duration || 1, audioRef.current.currentTime + deltaSec));
    audioRef.current.currentTime = target;
    setCurrentTime(target);
  };

  const handleScrub = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current || !audioRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const targetSec = ratio * (duration || 1);
    audioRef.current.currentTime = targetSec;
    setCurrentTime(targetSec);
    if (onTimeUpdate) onTimeUpdate(targetSec);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setHoverSec(ratio * (duration || 1));
  };

  const handleRateChange = (rate: number) => {
    setPlaybackRate(rate);
    if (audioRef.current) {
      audioRef.current.playbackRate = rate;
    }
  };

  const formatTime = (secs: number) => {
    const s = Math.floor(secs || 0);
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return `${m.toString().padStart(2, '0')}:${rem.toString().padStart(2, '0')}`;
  };

  const progressRatio = duration > 0 ? Math.min(1, currentTime / duration) : 0;

  // Normalized peaks: default to 140 synthetic bars if API loading or empty
  const peaks = useMemo(() => {
    if (waveform?.peaks && waveform.peaks.length > 0) {
      return waveform.peaks;
    }
    // Fallback baseline bar heights
    return Array.from({ length: 140 }, (_, i) => {
      const v = Math.sin(i * 0.15) * 0.35 + Math.cos(i * 0.4) * 0.25 + 0.3;
      return Math.max(0.08, Math.min(0.95, v));
    });
  }, [waveform]);

  return (
    <div
      style={{
        background: '#0f172a',
        borderRadius: 12,
        padding: '16px 20px',
        border: '1px solid #1e293b',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
        color: '#f8fafc',
        marginBottom: 16,
      }}
    >
      <audio
        ref={audioRef}
        src={effectiveAudioUrl}
        preload="metadata"
        onTimeUpdate={() => {
          if (audioRef.current) {
            const cur = audioRef.current.currentTime;
            setCurrentTime(cur);
            if (onTimeUpdate) onTimeUpdate(cur);
          }
        }}
        onLoadedMetadata={() => {
          if (audioRef.current) {
            const d = audioRef.current.duration;
            if (d && !isNaN(d) && isFinite(d)) setDuration(d);
          }
        }}
        onEnded={() => setIsPlaying(false)}
        onError={() => setAudioError('Audio stream unavailable or still rendering')}
      />

      {/* Top Header / Track Metadata */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 12,
          flexWrap: 'wrap',
          gap: 8,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 24,
              height: 24,
              borderRadius: '50%',
              background: '#1e293b',
              color: '#38bdf8',
              fontSize: 12,
            }}
          >
            🎙️
          </span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#f1f5f9' }}>
              Dual-Channel Call Recording
            </div>
            <div style={{ fontSize: 11, color: '#94a3b8' }}>
              16kHz Stereo PCM · Left: Caller · Right: Agent
              {loadingWaveform && (
                <span style={{ color: '#38bdf8', marginLeft: 6, fontStyle: 'italic' }}>
                  (analyzing peaks...)
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Channel Isolation & Download */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div
            style={{
              display: 'flex',
              background: '#1e293b',
              borderRadius: 6,
              padding: 2,
              border: '1px solid #334155',
            }}
          >
            <button
              type="button"
              onClick={() => {
                setupWebAudio();
                setChannelMode('both');
              }}
              style={{
                background: channelMode === 'both' ? '#38bdf8' : 'transparent',
                color: channelMode === 'both' ? '#0f172a' : '#94a3b8',
                border: 'none',
                padding: '3px 8px',
                fontSize: 11,
                fontWeight: 600,
                borderRadius: 4,
                cursor: 'pointer',
              }}
              title="Listen to both channels (Stereo)"
            >
              Both
            </button>
            <button
              type="button"
              onClick={() => {
                setupWebAudio();
                setChannelMode('caller');
              }}
              style={{
                background: channelMode === 'caller' ? '#10b981' : 'transparent',
                color: channelMode === 'caller' ? '#0f172a' : '#94a3b8',
                border: 'none',
                padding: '3px 8px',
                fontSize: 11,
                fontWeight: 600,
                borderRadius: 4,
                cursor: 'pointer',
              }}
              title="Isolate Caller Channel (Left channel)"
            >
              Caller (L)
            </button>
            <button
              type="button"
              onClick={() => {
                setupWebAudio();
                setChannelMode('agent');
              }}
              style={{
                background: channelMode === 'agent' ? '#a855f7' : 'transparent',
                color: channelMode === 'agent' ? '#0f172a' : '#94a3b8',
                border: 'none',
                padding: '3px 8px',
                fontSize: 11,
                fontWeight: 600,
                borderRadius: 4,
                cursor: 'pointer',
              }}
              title="Isolate Agent Channel (Right channel)"
            >
              Agent (R)
            </button>
          </div>

          <a
            href={effectiveDownloadUrl}
            download={`${callId}.wav`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              background: '#1e293b',
              color: '#f8fafc',
              border: '1px solid #334155',
              padding: '4px 10px',
              fontSize: 11,
              fontWeight: 500,
              borderRadius: 6,
              textDecoration: 'none',
              cursor: 'pointer',
            }}
          >
            <span>⬇</span> Download WAV
          </a>
        </div>
      </div>

      {/* Waveform Canvas / Bars Display */}
      <div
        ref={containerRef}
        onClick={handleScrub}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoverSec(null)}
        style={{
          position: 'relative',
          height: 68,
          background: '#090d16',
          borderRadius: 8,
          cursor: 'pointer',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          padding: '0 8px',
          border: '1px solid #1e293b',
          userSelect: 'none',
        }}
      >
        {/* Progress Background Overlay */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: `${progressRatio * 100}%`,
            background: 'rgba(56, 189, 248, 0.12)',
            borderRight: '2px solid #38bdf8',
            pointerEvents: 'none',
            transition: 'width 0.05s linear',
            zIndex: 1,
          }}
        />

        {/* Turn Markers along timeline */}
        {turnMarkers.map((marker) => {
          const markerRatio = duration > 0 ? Math.min(1, marker.sec / duration) : 0;
          const isUser = marker.speaker === 'user';
          return (
            <div
              key={`turn-${marker.turnNumber}-${marker.sec}`}
              title={`Turn ${marker.turnNumber} (${isUser ? 'Caller' : 'Agent'}): ${formatTime(marker.sec)}`}
              onClick={(e) => {
                e.stopPropagation();
                if (audioRef.current) {
                  audioRef.current.currentTime = marker.sec;
                  setCurrentTime(marker.sec);
                }
              }}
              style={{
                position: 'absolute',
                left: `${markerRatio * 100}%`,
                top: 0,
                bottom: 0,
                width: 2,
                background: isUser ? '#10b981' : '#a855f7',
                opacity: 0.75,
                zIndex: 3,
                cursor: 'pointer',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  top: 2,
                  left: -6,
                  fontSize: 9,
                  fontWeight: 700,
                  padding: '1px 3px',
                  borderRadius: 3,
                  background: isUser ? '#065f46' : '#581c87',
                  color: '#ffffff',
                }}
              >
                T{marker.turnNumber}
              </div>
            </div>
          );
        })}

        {/* Waveform Bars */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            width: '100%',
            height: '100%',
            gap: 2,
            zIndex: 2,
            pointerEvents: 'none',
          }}
        >
          {peaks.map((peak, idx) => {
            const barRatio = idx / peaks.length;
            const isPlayed = barRatio <= progressRatio;
            // Channel color nuance: alternate or upper/lower
            const isCallerBar = idx % 2 === 0;
            const activeColor = isCallerBar ? '#38bdf8' : '#818cf8';
            const unplayedColor = '#334155';
            const barHeight = Math.max(6, Math.min(60, peak * 60));

            return (
              <div
                key={idx}
                style={{
                  flex: 1,
                  height: `${barHeight}px`,
                  background: isPlayed ? activeColor : unplayedColor,
                  borderRadius: 1,
                  transition: 'height 0.1s ease',
                }}
              />
            );
          })}
        </div>

        {/* Hover Scrub Timestamp Tooltip */}
        {hoverSec !== null && (
          <div
            style={{
              position: 'absolute',
              left: `${Math.max(0, Math.min(94, (hoverSec / (duration || 1)) * 100))}%`,
              bottom: 4,
              background: '#1e293b',
              color: '#f8fafc',
              fontSize: 10,
              fontFamily: 'monospace',
              padding: '2px 5px',
              borderRadius: 4,
              border: '1px solid #475569',
              pointerEvents: 'none',
              zIndex: 4,
            }}
          >
            {formatTime(hoverSec)}
          </div>
        )}
      </div>

      {audioError && (
        <div style={{ fontSize: 11, color: '#f87171', marginTop: 6 }}>
          ⚠️ {audioError}
        </div>
      )}

      {/* Control Bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: 12,
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        {/* Play / Skip / Time Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            type="button"
            onClick={togglePlay}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 36,
              height: 36,
              borderRadius: '50%',
              background: isPlaying ? '#38bdf8' : '#2563eb',
              color: '#ffffff',
              border: 'none',
              fontSize: 14,
              cursor: 'pointer',
              boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
            }}
            title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
          >
            {isPlaying ? '⏸' : '▶'}
          </button>

          <button
            type="button"
            onClick={() => seekRelative(-5)}
            style={{
              background: '#1e293b',
              color: '#94a3b8',
              border: '1px solid #334155',
              borderRadius: 6,
              padding: '4px 8px',
              fontSize: 11,
              cursor: 'pointer',
            }}
            title="Rewind 5 seconds"
          >
            -5s
          </button>
          <button
            type="button"
            onClick={() => seekRelative(5)}
            style={{
              background: '#1e293b',
              color: '#94a3b8',
              border: '1px solid #334155',
              borderRadius: 6,
              padding: '4px 8px',
              fontSize: 11,
              cursor: 'pointer',
            }}
            title="Forward 5 seconds"
          >
            +5s
          </button>

          {/* Time text */}
          <div
            style={{
              fontFamily: 'monospace',
              fontSize: 13,
              color: '#cbd5e1',
              marginLeft: 4,
            }}
          >
            <span>{formatTime(currentTime)}</span>
            <span style={{ color: '#64748b', margin: '0 4px' }}>/</span>
            <span style={{ color: '#94a3b8' }}>{formatTime(duration)}</span>
          </div>
        </div>

        {/* Speed & Volume */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* Speed Presets */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 11, color: '#64748b' }}>Speed:</span>
            {[1.0, 1.25, 1.5, 2.0].map((rate) => (
              <button
                key={rate}
                type="button"
                onClick={() => handleRateChange(rate)}
                style={{
                  background: playbackRate === rate ? '#334155' : 'transparent',
                  color: playbackRate === rate ? '#38bdf8' : '#94a3b8',
                  border: '1px solid',
                  borderColor: playbackRate === rate ? '#38bdf8' : '#334155',
                  padding: '2px 6px',
                  borderRadius: 4,
                  fontSize: 11,
                  fontWeight: playbackRate === rate ? 600 : 400,
                  cursor: 'pointer',
                }}
              >
                {rate}x
              </button>
            ))}
          </div>

          {/* Volume Control */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button
              type="button"
              onClick={() => {
                if (audioRef.current) {
                  const next = !isMuted;
                  setIsMuted(next);
                  audioRef.current.muted = next;
                }
              }}
              style={{
                background: 'transparent',
                border: 'none',
                color: isMuted ? '#f87171' : '#94a3b8',
                fontSize: 12,
                cursor: 'pointer',
                padding: 0,
              }}
              title={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted ? '🔇' : '🔊'}
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={isMuted ? 0 : volume}
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                setVolume(val);
                setIsMuted(val === 0);
                if (audioRef.current) {
                  audioRef.current.volume = val;
                  audioRef.current.muted = val === 0;
                }
              }}
              style={{
                width: 60,
                accentColor: '#38bdf8',
                cursor: 'pointer',
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
