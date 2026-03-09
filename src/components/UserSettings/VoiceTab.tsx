import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useVoiceStore } from "../../store/voice.js";

export default function VoiceTab() {
  const { t } = useTranslation();
  const {
    inputDeviceId,
    outputDeviceId,
    inputVolume,
    outputVolume,
    echoCancellation,
    noiseSuppressionMode,
    soundVoice,
    soundUserJoinLeave,
    soundMute,
    soundScreenShare,
    soundMessage,
    soundCurrentChannel,
    soundCallRingtone,
    setInputDevice,
    setOutputDevice,
    setInputVolume,
    setOutputVolume,
    setEchoCancellation,
    setNoiseSuppressionMode,
    setSoundSetting,
  } = useVoiceStore();

  const [inputDevices, setInputDevices] = useState<MediaDeviceInfo[]>([]);
  const [outputDevices, setOutputDevices] = useState<MediaDeviceInfo[]>([]);
  const [testing, setTesting] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const testRef = useRef<{ stream: MediaStream; ctx: AudioContext; raf: number } | null>(null);

  useEffect(() => {
    navigator.mediaDevices.enumerateDevices().then((devices) => {
      setInputDevices(devices.filter((d) => d.kind === "audioinput"));
      setOutputDevices(devices.filter((d) => d.kind === "audiooutput"));
    });
  }, []);

  const startMicTest = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: inputDeviceId ? { exact: inputDeviceId } : undefined },
      });
      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      function tick() {
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
        const rms = sum / dataArray.length;
        setAudioLevel(Math.min(100, (rms / 128) * 100));
        testRef.current!.raf = requestAnimationFrame(tick);
      }

      testRef.current = { stream, ctx, raf: requestAnimationFrame(tick) };
      setTesting(true);
    } catch {
      // User denied mic access or device unavailable
    }
  }, [inputDeviceId]);

  const stopMicTest = useCallback(() => {
    if (testRef.current) {
      cancelAnimationFrame(testRef.current.raf);
      testRef.current.stream.getTracks().forEach((t) => t.stop());
      testRef.current.ctx.close();
      testRef.current = null;
    }
    setTesting(false);
    setAudioLevel(0);
  }, []);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (testRef.current) {
        cancelAnimationFrame(testRef.current.raf);
        testRef.current.stream.getTracks().forEach((t) => t.stop());
        testRef.current.ctx.close();
        testRef.current = null;
      }
    };
  }, []);

  return (
    <div className="settings-section">
      <div className="settings-section-title">{t("userSettings.voice.inputDevice")}</div>
      <select
        className="settings-select"
        value={inputDeviceId}
        onChange={(e) => setInputDevice(e.target.value)}
      >
        <option value="">{t("userSettings.voice.default")}</option>
        {inputDevices.map((d) => (
          <option key={d.deviceId} value={d.deviceId}>
            {d.label || `Microphone (${d.deviceId.slice(0, 8)})`}
          </option>
        ))}
      </select>

      <div className="settings-section-title">{t("userSettings.voice.inputVolume")}</div>
      <div className="settings-slider-row">
        <input
          type="range"
          className="settings-slider"
          min={0}
          max={200}
          value={Math.round(inputVolume * 100)}
          onChange={(e) => setInputVolume(Number(e.target.value) / 100)}
        />
        <span className="settings-slider-value">{Math.round(inputVolume * 100)}%</span>
      </div>

      <div className="settings-mic-test">
        <button
          className="btn-secondary"
          onClick={testing ? stopMicTest : startMicTest}
        >
          {testing ? t("userSettings.voice.stopTest") : t("userSettings.voice.testMicrophone")}
        </button>
        {testing && (
          <div className="mic-level-bar">
            <div className="mic-level-fill" style={{ width: `${audioLevel}%` }} />
          </div>
        )}
      </div>

      <div className="settings-section-title" style={{ marginTop: 24 }}>{t("userSettings.voice.outputDevice")}</div>
      <select
        className="settings-select"
        value={outputDeviceId}
        onChange={(e) => setOutputDevice(e.target.value)}
      >
        <option value="">{t("userSettings.voice.default")}</option>
        {outputDevices.map((d) => (
          <option key={d.deviceId} value={d.deviceId}>
            {d.label || `Speaker (${d.deviceId.slice(0, 8)})`}
          </option>
        ))}
      </select>

      <div className="settings-section-title">{t("userSettings.voice.outputVolume")}</div>
      <div className="settings-slider-row">
        <input
          type="range"
          className="settings-slider"
          min={0}
          max={200}
          value={Math.round(outputVolume * 100)}
          onChange={(e) => setOutputVolume(Number(e.target.value) / 100)}
        />
        <span className="settings-slider-value">{Math.round(outputVolume * 100)}%</span>
      </div>

      <div className="settings-section-title" style={{ marginTop: 24 }}>{t("userSettings.voice.voiceProcessing")}</div>
      <label className="settings-toggle-label">
        <input
          type="checkbox"
          checked={echoCancellation}
          onChange={(e) => setEchoCancellation(e.target.checked)}
        />
        <span>{t("userSettings.voice.echoCancellation")}</span>
      </label>
      <div className="settings-section-title" style={{ marginTop: 16 }}>{t("userSettings.voice.noiseSuppression")}</div>
      <select
        className="settings-select"
        value={noiseSuppressionMode}
        onChange={(e) => setNoiseSuppressionMode(e.target.value as "off" | "standard" | "enhanced")}
      >
        <option value="off">{t("userSettings.voice.noiseSuppressionOff")}</option>
        <option value="standard">{t("userSettings.voice.noiseSuppressionStandard")}</option>
        <option value="enhanced">{t("userSettings.voice.noiseSuppressionEnhanced")}</option>
      </select>
      <p className="settings-description">{t(`userSettings.voice.noiseSuppressionDesc.${noiseSuppressionMode}`)}</p>

      <div className="settings-section-title" style={{ marginTop: 24 }}>{t("userSettings.voice.soundEffects")}</div>
      {([
        ["soundVoice", soundVoice],
        ["soundUserJoinLeave", soundUserJoinLeave],
        ["soundMute", soundMute],
        ["soundScreenShare", soundScreenShare],
        ["soundMessage", soundMessage],
        ["soundCurrentChannel", soundCurrentChannel],
        ["soundCallRingtone", soundCallRingtone],
      ] as const).map(([key, val]) => (
        <label key={key} className="settings-toggle-label">
          <input
            type="checkbox"
            checked={val}
            onChange={(e) => setSoundSetting(key, e.target.checked)}
          />
          <span>{t(`userSettings.voice.sound.${key}`)}</span>
        </label>
      ))}
    </div>
  );
}
