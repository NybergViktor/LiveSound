import { useEffect, useRef, useState } from "react";

const SIGNAL_SERVER = "ws://100.86.87.121:3001"; // WebSocket-server
const userId = Math.random().toString(36).substr(2, 9); // Genererar ett unikt ID

export default function App() {
  const [isSender, setIsSender] = useState(null);
  const [connected, setConnected] = useState(false);
  const [volume, setVolume] = useState(0);
  const peerConnection = useRef(null); // Startar som null
  const socket = useRef(null);
  const localStream = useRef(null);
  const audioRef = useRef(null);

  useEffect(() => {
    // ✅ Kontrollera att vi inte skapar flera PeerConnections
    if (!peerConnection.current) {
      console.log("✅ Skapar ny PeerConnection...");
      peerConnection.current = new RTCPeerConnection();
    } else {
      console.warn("⚠️ PeerConnection redan skapad!");
    }

    if (!socket.current) {
      socket.current = new WebSocket(SIGNAL_SERVER);

      socket.current.onopen = () => {
        console.log("✅ WebSocket-anslutning öppen!");
        socket.current.send(JSON.stringify({ type: "register", id: userId }));
      };

      socket.current.onmessage = async (message) => {
        const data = JSON.parse(message.data);
        if (data.type === "signal") {
          if (data.signal.type === "offer") {
            await peerConnection.current.setRemoteDescription(
              new RTCSessionDescription(data.signal)
            );
            const answer = await peerConnection.current.createAnswer();
            await peerConnection.current.setLocalDescription(answer);
            sendSignal("receiver", answer);
          } else if (data.signal.type === "answer") {
            await peerConnection.current.setRemoteDescription(
              new RTCSessionDescription(data.signal)
            );
          } else if (data.signal.type === "candidate") {
            await peerConnection.current.addIceCandidate(
              new RTCIceCandidate(data.signal)
            );
          }
        }
      };
    }

    peerConnection.current.onicecandidate = (event) => {
      if (event.candidate) {
        sendSignal(isSender ? "receiver" : "sender", event.candidate);
      }
    };

    peerConnection.current.ontrack = (event) => {
      if (audioRef.current) {
        audioRef.current.srcObject = event.streams[0];
      }
    };

    return () => {
      console.log("🔴 Stänger PeerConnection...");
      if (peerConnection.current) {
        peerConnection.current.close();
        peerConnection.current = null;
      }
    };
  }, [isSender]);

  const sendSignal = (target, signal) => {
    if (socket.current && socket.current.readyState === WebSocket.OPEN) {
      socket.current.send(JSON.stringify({ type: "signal", target, signal }));
    } else {
      console.warn("WebSocket inte redo, väntar...");
      setTimeout(() => sendSignal(target, signal), 100);
    }
  };

  const startStreaming = async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioDevice = devices.find(
        (device) =>
          device.label.includes("CABLE Output") && device.kind === "audioinput"
      );

      if (!audioDevice) {
        alert(
          "❌ Ingen systemljudkälla hittades! Se till att 'VB-Audio Virtual Cable' är aktiverat."
        );
        return;
      }

      console.log("🎤 Använder ljudkälla:", audioDevice);

      localStream.current = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: audioDevice.deviceId
            ? { exact: audioDevice.deviceId }
            : undefined,
        },
      });

      localStream.current
        .getTracks()
        .forEach((track) =>
          peerConnection.current.addTrack(track, localStream.current)
        );

      const audioContext = new AudioContext();
      const analyser = audioContext.createAnalyser();
      const source = audioContext.createMediaStreamSource(localStream.current);
      source.connect(analyser);
      analyser.fftSize = 256;
      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const updateVolume = () => {
        analyser.getByteFrequencyData(dataArray);
        const avg = dataArray.reduce((a, b) => a + b, 0) / bufferLength;
        setVolume(avg);
        requestAnimationFrame(updateVolume);
      };
      updateVolume();

      const offer = await peerConnection.current.createOffer();
      await peerConnection.current.setLocalDescription(offer);
      sendSignal("receiver", offer);

      setConnected(true);
    } catch (error) {
      console.error("❌ Fel vid åtkomst av systemljud:", error);
    }
  };

  const startListening = () => {
    setConnected(true);
  };

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold">WebRTC Datorljudsdelning</h1>

      {isSender === null ? (
        <div>
          <button
            onClick={() => setIsSender(true)}
            className="p-2 bg-blue-500 text-white rounded"
          >
            Jag vill sända ljud
          </button>
          <button
            onClick={() => setIsSender(false)}
            className="p-2 bg-green-500 text-white rounded ml-4"
          >
            Jag vill lyssna
          </button>
        </div>
      ) : isSender ? (
        <div>
          {!connected ? (
            <button
              onClick={startStreaming}
              className="p-2 bg-red-500 text-white rounded"
            >
              Starta sändning
            </button>
          ) : (
            <div>
              <p>Sändning pågår...</p>
              <p>🔊 Ljudnivå: {volume.toFixed(2)} dB</p>
            </div>
          )}
        </div>
      ) : (
        <div>
          {!connected ? (
            <button
              onClick={startListening}
              className="p-2 bg-green-500 text-white rounded"
            >
              Anslut och lyssna
            </button>
          ) : (
            <audio ref={audioRef} autoPlay controls className="mt-2" />
          )}
        </div>
      )}
    </div>
  );
}
