import { useEffect, useRef, useState } from 'react'
import './App.css'

// Caminho do modelo (arquivos ficam em /public/model)
// BASE_URL respeita o "base" do vite.config (necessário no GitHub Pages)
const MODEL_URL = import.meta.env.BASE_URL + 'model/model.json'
const METADATA_URL = import.meta.env.BASE_URL + 'model/metadata.json'

// Nome exato da classe de fadiga no seu modelo (metadata.json -> labels)
const FATIGUE_LABEL = 'Fatigue'
// Probabilidade mínima para considerar que está em fadiga
const FATIGUE_THRESHOLD = 0.7
// Tempo (ms) que precisa ficar em fadiga antes de disparar o alerta
const ALERT_AFTER_MS = 5000

export default function App() {
  const videoRef = useRef(null)        // <video> com a imagem da câmera
  const streamRef = useRef(null)       // MediaStream da câmera
  const modelRef = useRef(null)        // modelo carregado
  const rafRef = useRef(null)          // id do requestAnimationFrame

  // controle do tempo em fadiga
  const fatigueStartRef = useRef(null)
  const alertActiveRef = useRef(false)

  // Web Audio (alarme gerado, sem precisar de arquivo mp3)
  const audioCtxRef = useRef(null)
  const beepIntervalRef = useRef(null)

  const [status, setStatus] = useState('parado') // parado | carregando | rodando
  const [running, setRunning] = useState(false)
  const [predictions, setPredictions] = useState([])
  const [fatigueSeconds, setFatigueSeconds] = useState(0)
  const [alerting, setAlerting] = useState(false)
  const [messages, setMessages] = useState([])

  // ---------- Chat / log da "sala de controle" ----------
  function addMessage(text, tone = 'info') {
    const now = new Date()
    const hora = now.toLocaleTimeString('pt-BR')
    setMessages((prev) => [...prev, { id: now.getTime() + Math.random(), hora, text, tone }])
  }

  // ---------- Alarme sonoro (Web Audio API) ----------
  function startAlarm() {
    if (beepIntervalRef.current) return
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)()
    }
    const ctx = audioCtxRef.current
    if (ctx.state === 'suspended') ctx.resume()

    const beep = () => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'square'
      osc.frequency.value = 880
      gain.gain.setValueAtTime(0.0001, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start()
      osc.stop(ctx.currentTime + 0.26)
    }

    beep()
    beepIntervalRef.current = setInterval(beep, 600)
  }

  function stopAlarm() {
    if (beepIntervalRef.current) {
      clearInterval(beepIntervalRef.current)
      beepIntervalRef.current = null
    }
  }

  // ---------- Iniciar câmera + detecção ----------
  async function start() {
    try {
      setStatus('carregando')

      // tmImage vem do script CDN carregado no index.html
      const tmImage = window.tmImage
      if (!tmImage) {
        throw new Error(
          'Biblioteca do Teachable Machine não carregou. Verifique sua conexão com a internet (os scripts vêm por CDN) e recarregue a página.'
        )
      }

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error(
          'Este navegador não permite acesso à câmera. Use Chrome/Edge em http://localhost (não abra o arquivo direto nem pelo IP da rede).'
        )
      }

      // Carrega o modelo do Teachable Machine
      addMessage('Carregando modelo...', 'info')
      const model = await tmImage.load(MODEL_URL, METADATA_URL)
      modelRef.current = model

      // Liga a câmera
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user' },
        audio: false,
      })
      streamRef.current = stream

      const video = videoRef.current
      video.srcObject = stream
      await video.play()

      setStatus('rodando')
      setRunning(true)
      addMessage('Câmera ligada. Monitoramento iniciado.', 'system')

      rafRef.current = window.requestAnimationFrame(loop)
    } catch (err) {
      console.error(err)
      setStatus('parado')
      let msg = err.message
      if (err.name === 'NotAllowedError') {
        msg = 'Permissão da câmera negada. Autorize o acesso à câmera no navegador e tente de novo.'
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        msg = 'Nenhuma câmera encontrada no dispositivo.'
      } else if (err.name === 'NotReadableError') {
        msg = 'A câmera já está sendo usada por outro programa (feche Zoom/Teams/etc.).'
      }
      addMessage('Erro ao iniciar a câmera: ' + msg, 'alert')
    }
  }

  // ---------- Loop de predição ----------
  async function loop() {
    if (!modelRef.current || !videoRef.current) return
    await predict()
    rafRef.current = window.requestAnimationFrame(loop)
  }

  async function predict() {
    const model = modelRef.current
    const video = videoRef.current
    if (!video || video.readyState < 2) return // ainda sem frame

    const prediction = await model.predict(video)
    setPredictions(prediction)

    // Probabilidade da classe de fadiga
    const fatigue = prediction.find((p) => p.className === FATIGUE_LABEL)
    const isFatigued = fatigue && fatigue.probability >= FATIGUE_THRESHOLD

    const now = Date.now()

    if (isFatigued) {
      if (fatigueStartRef.current === null) {
        fatigueStartRef.current = now
      }
      const elapsed = now - fatigueStartRef.current
      setFatigueSeconds(elapsed / 1000)

      if (elapsed >= ALERT_AFTER_MS && !alertActiveRef.current) {
        alertActiveRef.current = true
        setAlerting(true)
        startAlarm()
        addMessage('⚠️ FADIGA DETECTADA por mais de 5 segundos!', 'alert')
        addMessage('📡 Ocorrência enviada para a Sala de Controle.', 'system')
      }
    } else {
      if (alertActiveRef.current) {
        addMessage('✅ Motorista recuperou o estado de alerta. Alarme encerrado.', 'ok')
      }
      fatigueStartRef.current = null
      alertActiveRef.current = false
      setFatigueSeconds(0)
      setAlerting(false)
      stopAlarm()
    }
  }

  // ---------- Parar ----------
  function stop() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = null
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    if (videoRef.current) videoRef.current.srcObject = null
    stopAlarm()
    fatigueStartRef.current = null
    alertActiveRef.current = false
    setRunning(false)
    setAlerting(false)
    setFatigueSeconds(0)
    setPredictions([])
    setStatus('parado')
    addMessage('Monitoramento encerrado.', 'system')
  }

  // Limpeza ao desmontar
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop())
      stopAlarm()
    }
  }, [])

  return (
    <div className="app">
      <header>
        <h1>Sistema de Detecção de Fadiga</h1>
        <span className={`status status-${status}`}>{status.toUpperCase()}</span>
      </header>

      <div className="content">
        {/* Coluna esquerda: câmera + predições */}
        <section className="camera-panel">
          <div className={`webcam-container ${alerting ? 'alerting' : ''}`}>
            {/* O vídeo fica sempre no DOM; só escondido quando parado */}
            <video
              ref={videoRef}
              className="webcam-video"
              autoPlay
              playsInline
              muted
              style={{ display: running ? 'block' : 'none' }}
            />
            {!running && <div className="placeholder">Câmera desligada</div>}
          </div>

          <div className="controls">
            {!running ? (
              <button className="btn btn-start" onClick={start} disabled={status === 'carregando'}>
                {status === 'carregando' ? 'Carregando...' : '▶ Ligar câmera'}
              </button>
            ) : (
              <button className="btn btn-stop" onClick={stop}>■ Parar</button>
            )}
          </div>

          {running && (
            <div className="predictions">
              {predictions.map((p) => (
                <div key={p.className} className="pred-row">
                  <span className="pred-label">{p.className}</span>
                  <div className="pred-bar">
                    <div
                      className={`pred-fill ${p.className === FATIGUE_LABEL ? 'fill-fatigue' : ''}`}
                      style={{ width: `${(p.probability * 100).toFixed(1)}%` }}
                    />
                  </div>
                  <span className="pred-value">{(p.probability * 100).toFixed(0)}%</span>
                </div>
              ))}

              <div className={`fatigue-timer ${alerting ? 'danger' : ''}`}>
                Tempo em fadiga: <strong>{fatigueSeconds.toFixed(1)}s</strong> / {ALERT_AFTER_MS / 1000}s
              </div>
            </div>
          )}
        </section>

        {/* Coluna direita: chat da sala de controle */}
        <section className="chat-panel">
          <div className="chat-header">
            <span className="dot" /> Sala de Controle
          </div>
          <div className="chat-body">
            {messages.length === 0 && (
              <p className="chat-empty">Nenhuma ocorrência ainda.</p>
            )}
            {messages.map((m) => (
              <div key={m.id} className={`chat-msg tone-${m.tone}`}>
                <span className="chat-time">{m.hora}</span>
                <span className="chat-text">{m.text}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
