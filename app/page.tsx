'use client'

import { useEffect, useRef, useState } from 'react'
import { BinaryBitmap, Code128Reader, HybridBinarizer, RGBLuminanceSource } from '@zxing/library'
import { Camera, Heart, LockKeyhole, Music, Pause, Play, Volume2, VolumeX, Sparkles, ChevronDown } from 'lucide-react'

const BARCODE_KEY = '061223'
const NATIVE_BARCODE_FORMAT = 'code_128'

const describeScannerError = (cause: unknown) => {
  if (cause instanceof Error) return cause.message || cause.name
  if (typeof cause === 'string') return cause
  if (cause === undefined) return 'penyebab tidak disediakan'
  if (cause === null) return 'penyebab bernilai null'
  return Object.prototype.toString.call(cause)
}

const decodeBarcodeCanvas = (reader: Code128Reader, context: CanvasRenderingContext2D, width: number, height: number) => {
  const pixels = context.getImageData(0, 0, width, height).data
  const luminance = new Uint8ClampedArray(width * height)
  for (let pixel = 0; pixel < luminance.length; pixel += 1) {
    const offset = pixel * 4
    luminance[pixel] = (306 * pixels[offset] + 601 * pixels[offset + 1] + 117 * pixels[offset + 2] + 0x200) >> 10
  }

  const source = new RGBLuminanceSource(luminance, width, height)
  return reader.decode(new BinaryBitmap(new HybridBinarizer(source))).getText()
}

type DetectedBarcode = { rawValue: string }
type NativeBarcodeDetector = {
  detect: (source: HTMLVideoElement) => Promise<DetectedBarcode[]>
}
type NativeBarcodeDetectorConstructor = {
  new(options?: { formats: string[] }): NativeBarcodeDetector
  getSupportedFormats?: () => Promise<string[]>
}
const memories = [
  { src: 'https://images.unsplash.com/photo-1518199266791-5375a83190b7?auto=format&fit=crop&w=900&q=85', alt: 'Pasangan berjalan bersama saat senja', className: 'memory-tall' },
  { src: 'https://images.unsplash.com/photo-1516589178581-6cd7833ae3b2?auto=format&fit=crop&w=900&q=85', alt: 'Tangan pasangan saling menggenggam', className: 'memory-wide' },
  { src: 'https://images.unsplash.com/photo-1522673607200-164d1b6ce486?auto=format&fit=crop&w=900&q=85', alt: 'Pasangan berbagi momen romantis', className: '' },
  { src: 'https://images.unsplash.com/photo-1494774157365-9e04c6720e47?auto=format&fit=crop&w=900&q=85', alt: 'Pasangan menikmati waktu bersama', className: 'memory-wide' },
]
const musicTracks = [
  { title: 'Penjaga Hati', artist: 'Nadhif Basalamah', src: '/music/Penjaga%20Hati.mp3' },
  { title: 'Komang', artist: 'Raim Laode', src: '/music/KOMANG.mp3' },
]

export default function Page() {
  const [opened, setOpened] = useState(false)
  const [unlocked, setUnlocked] = useState(false)
  const [error, setError] = useState('')
  const [scanStatus, setScanStatus] = useState('Membaca barcode kunci...')
  const [barcodeReady, setBarcodeReady] = useState(false)
  const [cameraStarting, setCameraStarting] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [cameraDevices, setCameraDevices] = useState<MediaDeviceInfo[]>([])
  const [selectedCameraId, setSelectedCameraId] = useState('')
  const [playing, setPlaying] = useState(false)
  const [muted, setMuted] = useState(false)
  const [selectedTrack, setSelectedTrack] = useState(0)
  const [letterOpened, setLetterOpened] = useState(false)
  const audioRef = useRef<HTMLAudioElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const fullFrameCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const readerRef = useRef<Code128Reader | null>(null)
  const cameraStreamRef = useRef<MediaStream | null>(null)
  const scannerRunRef = useRef(0)
  const scanTimerRef = useRef<number | null>(null)

  useEffect(() => {
    if (!unlocked || !audioRef.current) return

    audioRef.current.load()
    audioRef.current.play().then(() => setPlaying(true)).catch(() => setPlaying(false))
  }, [unlocked, selectedTrack])

  useEffect(() => {
    if (!unlocked) return

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible')
          observer.unobserve(entry.target)
        }
      })
    }, { threshold: 0.14, rootMargin: '0px 0px -36px' })

    document.querySelectorAll('.reveal-on-scroll').forEach((element) => observer.observe(element))
    return () => observer.disconnect()
  }, [unlocked])

  useEffect(() => {
    if (audioRef.current) audioRef.current.muted = muted
  }, [muted])

  useEffect(() => {
    if (!opened) return

    const reader = new Code128Reader()
    readerRef.current = reader
    setBarcodeReady(true)
    setError('')
    setScanStatus('Meminta akses kamera...')
    void startScanner()

    return () => {
      scannerRunRef.current += 1
      if (scanTimerRef.current !== null) window.clearTimeout(scanTimerRef.current)
      scanTimerRef.current = null
      cameraStreamRef.current?.getTracks().forEach((track) => track.stop())
      cameraStreamRef.current = null
      if (videoRef.current) videoRef.current.srcObject = null
      readerRef.current = null
    }
  }, [opened])

  const openEnvelope = () => setOpened(true)

  const playSuccessSound = () => {
    if (typeof window === 'undefined') return

    const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioContextClass) return

    const context = new AudioContextClass()
    const gain = context.createGain()
    gain.gain.setValueAtTime(0.0001, context.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.16, context.currentTime + 0.03)
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.8)
    gain.connect(context.destination)

    ;[523.25, 659.25, 783.99].forEach((frequency, index) => {
      const oscillator = context.createOscillator()
      oscillator.type = 'sine'
      oscillator.frequency.value = frequency
      oscillator.connect(gain)
      oscillator.start(context.currentTime + index * 0.08)
      oscillator.stop(context.currentTime + 0.8)
    })

    window.setTimeout(() => context.close(), 1000)
  }

  const stopScanner = () => {
    scannerRunRef.current += 1
    if (scanTimerRef.current !== null) window.clearTimeout(scanTimerRef.current)
    scanTimerRef.current = null
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop())
    cameraStreamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setScanning(false)
    setScanStatus('Pemindaian dihentikan.')
  }

  const startScanner = async (cameraId = selectedCameraId) => {
    if (!readerRef.current || !videoRef.current || !navigator.mediaDevices?.getUserMedia) {
      setError('Kamera tidak tersedia. Buka halaman melalui localhost atau HTTPS dan izinkan akses kamera.')
      return
    }

    const scannerRun = scannerRunRef.current + 1
    scannerRunRef.current = scannerRun
    setError('')
    setScanStatus('Meminta akses kamera...')
    setCameraStarting(true)

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          ...(cameraId ? { deviceId: { exact: cameraId } } : {}),
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      })
      if (scannerRunRef.current !== scannerRun) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }
      cameraStreamRef.current = stream
      videoRef.current.srcObject = stream
      await videoRef.current.play()
      setCameraStarting(false)
      setScanning(true)
      setScanStatus('Kamera aktif. Tunjukkan barcode dengan jelas di depan kamera.')

      const devices = await navigator.mediaDevices.enumerateDevices()
      if (scannerRunRef.current !== scannerRun) return
      const videoDevices = devices.filter((device) => device.kind === 'videoinput')
      setCameraDevices(videoDevices)
      const activeTrack = stream.getVideoTracks()[0]
      const activeDeviceId = activeTrack?.getSettings().deviceId
      if (activeDeviceId) setSelectedCameraId(activeDeviceId)

      const detectorWindow = window as Window & {
        BarcodeDetector?: NativeBarcodeDetectorConstructor
      }
      const Detector = detectorWindow.BarcodeDetector
      let detector: NativeBarcodeDetector | null = null
      if (Detector?.getSupportedFormats) {
        try {
          const nativeFormats = await Detector.getSupportedFormats()
          if (nativeFormats.includes(NATIVE_BARCODE_FORMAT)) {
            detector = new Detector({ formats: [NATIVE_BARCODE_FORMAT] })
          }
        } catch (cause: unknown) {
          setError(`Pemindai bawaan tidak tersedia; pemindai alternatif digunakan: ${cause instanceof Error ? cause.message : String(cause)}`)
        }
      }
      let nativeDetectorFailed = false
      if (scannerRunRef.current !== scannerRun) return
      const cameraLabel = activeTrack?.label || 'Kamera'
      const cameraResolution = `${videoRef.current?.videoWidth ?? 0}×${videoRef.current?.videoHeight ?? 0}`
      setScanStatus(`${cameraLabel} aktif (${cameraResolution}). Tampilkan barcode dari HP lain atau cetakan di dalam kotak.`)

      const canvas = canvasRef.current ?? document.createElement('canvas')
      canvasRef.current = canvas
      const fullFrameCanvas = fullFrameCanvasRef.current ?? document.createElement('canvas')
      fullFrameCanvasRef.current = fullFrameCanvas
      let lastZXingAttempt = 0
      let lastNoBarcodeMessage = 0
      let lastWrongValue: string | undefined
      let lastScannerError = ''
      const scanFrame = async () => {
        if (scannerRunRef.current !== scannerRun) return

        const video = videoRef.current
        if (video && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0) {
          let detectedValue: string | undefined
          if (detector && !nativeDetectorFailed) {
            try {
              detectedValue = (await detector.detect(video))[0]?.rawValue
            } catch (cause: unknown) {
              nativeDetectorFailed = true
              setError(`Pemindai bawaan browser tidak tersedia; beralih ke pemindai alternatif: ${cause instanceof Error ? cause.message : String(cause)}`)
              setScanStatus('Pemindai alternatif aktif. Arahkan barcode ke tengah gambar kamera.')
            }
          }

          const now = performance.now()
          if (!detectedValue && now - lastZXingAttempt >= 300) {
            lastZXingAttempt = now
            const sourceWidth = Math.round(video.videoWidth * 0.92)
            const sourceHeight = Math.round(video.videoHeight * 0.84)
            const sourceX = Math.round((video.videoWidth - sourceWidth) / 2)
            const sourceY = Math.round((video.videoHeight - sourceHeight) / 2)
            canvas.width = sourceWidth * 2
            canvas.height = sourceHeight * 2
            const context = canvas.getContext('2d', { willReadFrequently: true })
            if (!context) {
              scannerRunRef.current += 1
              stream.getTracks().forEach((track) => track.stop())
              cameraStreamRef.current = null
              video.srcObject = null
              setScanning(false)
              setCameraStarting(false)
              setError('Browser tidak dapat menyiapkan gambar kamera untuk pemindaian.')
              return
            }
            context.imageSmoothingEnabled = true
            context.imageSmoothingQuality = 'high'
            context.drawImage(video, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, canvas.width, canvas.height)
            try {
              const reader = readerRef.current
              if (reader) detectedValue = decodeBarcodeCanvas(reader, context, canvas.width, canvas.height)
            } catch (cause: unknown) {
              const exceptionName = cause instanceof Error ? cause.name : ''
              if (!['NotFoundException', 'ChecksumException', 'FormatException'].includes(exceptionName)) {
                const message = describeScannerError(cause)
                if (message !== lastScannerError) {
                  lastScannerError = message
                  setError(`Pemindai barcode mengalami kendala: ${message}. Pemindaian akan terus mencoba.`)
                }
              }
            }

            if (!detectedValue) {
              fullFrameCanvas.width = video.videoWidth
              fullFrameCanvas.height = video.videoHeight
              const fullFrameContext = fullFrameCanvas.getContext('2d', { willReadFrequently: true })
              if (!fullFrameContext) {
                scannerRunRef.current += 1
                stream.getTracks().forEach((track) => track.stop())
                cameraStreamRef.current = null
                video.srcObject = null
                setScanning(false)
                setError('Browser tidak dapat menyiapkan gambar kamera untuk pemindaian.')
                return
              }
              fullFrameContext.drawImage(video, 0, 0, fullFrameCanvas.width, fullFrameCanvas.height)
              try {
                const reader = readerRef.current
                if (reader) detectedValue = decodeBarcodeCanvas(reader, fullFrameContext, fullFrameCanvas.width, fullFrameCanvas.height)
              } catch (cause: unknown) {
                const exceptionName = cause instanceof Error ? cause.name : ''
                if (!['NotFoundException', 'ChecksumException', 'FormatException'].includes(exceptionName)) {
                  const message = describeScannerError(cause)
                  if (message !== lastScannerError) {
                    lastScannerError = message
                    setError(`Pemindai barcode mengalami kendala: ${message}. Pemindaian akan terus mencoba.`)
                  }
                }
              }
            }
          }

          if (detectedValue) {
            if (detectedValue === BARCODE_KEY) {
              scannerRunRef.current += 1
              if (scanTimerRef.current !== null) window.clearTimeout(scanTimerRef.current)
              stream.getTracks().forEach((track) => track.stop())
              cameraStreamRef.current = null
              video.srcObject = null
              playSuccessSound()
              setError('')
              setScanning(false)
              setUnlocked(true)
              return
            }
            lastScannerError = ''
            if (detectedValue !== lastWrongValue) {
              lastWrongValue = detectedValue
              setError(`Barcode terbaca: “${detectedValue}”, tetapi kuncinya harus 061223.`)
              setScanStatus('Barcode terdeteksi, tetapi tidak cocok dengan kunci.')
            }
          } else if (!detectedValue && now - lastNoBarcodeMessage >= 5000) {
            lastWrongValue = undefined
            lastNoBarcodeMessage = now
            if (lastScannerError) {
              setError(`Pemindai barcode mengalami kendala: ${lastScannerError}. Pemindaian akan terus mencoba.`)
            } else {
              setError('')
            }
            setScanStatus(`Belum terdeteksi (${cameraLabel}, ${cameraResolution}). Tampilkan barcode di HP lain/cetakan, isi kotak, dan pastikan fokus.`)
          }
        }

        scanTimerRef.current = window.setTimeout(() => void scanFrame(), 150)
      }

      void scanFrame()
    } catch (cause: unknown) {
      if (scannerRunRef.current !== scannerRun) return
      cameraStreamRef.current?.getTracks().forEach((track) => track.stop())
      cameraStreamRef.current = null
      if (videoRef.current) videoRef.current.srcObject = null
      setScanning(false)
      setCameraStarting(false)
      const name = cause instanceof Error ? cause.name : ''
      setError(name === 'NotAllowedError'
        ? 'Akses kamera ditolak. Izinkan kamera untuk situs ini melalui pengaturan browser, lalu coba lagi.'
        : `Kamera tidak dapat digunakan: ${cause instanceof Error ? cause.message : String(cause)}`)
      setScanStatus('Pemindaian belum dimulai.')
    }
  }

  const toggleMusic = () => {
    if (!audioRef.current) return
    if (playing) audioRef.current.pause()
    else audioRef.current.play().catch(() => undefined)
    setPlaying(!playing)
  }

  const selectTrack = (index: number) => {
    setSelectedTrack(index)
  }

  return (
    <main className="anniversary-page">
      <audio ref={audioRef} loop src={musicTracks[selectedTrack].src} />
      <div className="stars" aria-hidden="true"><span /><span /><span /><span /><span /><span /><span /><span /></div>

      {!unlocked ? (
        <section className={`gate-screen ${opened ? 'gate-opened' : ''}`} aria-label="Surat anniversary terkunci">
          <div className="moon moon-gate" aria-hidden="true" />
          <div className="gate-copy">
            <p className="eyebrow"> OUR LITTLE UNIVERSE</p>
            <h1>Sebuah surat<br /><em>untuk kita.</em></h1>
          </div>

          {!opened ? (
            <button className="envelope-wrap" onClick={openEnvelope} aria-label="Buka amplop cinta">
              <div className="envelope">
                <div className="envelope-flap" />
                <div className="envelope-body" />
                <div className="seal"><Heart fill="currentColor" size={25} /></div>
              </div>
              <span className="tap-hint">sentuh suratnya </span>
            </button>
          ) : (
            <div className="pin-card" role="dialog" aria-labelledby="pin-title">
              <div className="pin-icon"><LockKeyhole size={21} /></div>
              <p className="eyebrow pin-eyebrow">ONE LITTLE SECRET</p>
              <h2 id="pin-title">Pindai barcode kunci</h2>
              <p className="pin-helper">Arahkan webcam ke barcode di HP lain atau cetakan. Kamera Mac tidak bisa memindai barcode yang tampil di layar Mac itu sendiri.</p>
              <div className="scanner-frame">
                <video className="scanner-video" ref={videoRef} muted playsInline aria-label="Tampilan kamera pemindai barcode" />
                <div className="scanner-guide" aria-hidden="true" />
              </div>
              {cameraDevices.length > 1 && (
                <label className="camera-picker">
                  Kamera
                  <select
                    value={selectedCameraId}
                    disabled={cameraStarting}
                    onChange={(event) => {
                      const cameraId = event.target.value
                      stopScanner()
                      setSelectedCameraId(cameraId)
                      void startScanner(cameraId)
                    }}
                  >
                    {cameraDevices.map((camera, index) => (
                      <option value={camera.deviceId} key={camera.deviceId}>
                        {camera.label || `Kamera ${index + 1}`}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <button className="gold-button scanner-button" type="button" onClick={() => scanning ? stopScanner() : void startScanner()} disabled={!barcodeReady || cameraStarting}>
                <Camera size={15} /> {cameraStarting ? 'Meminta izin kamera...' : scanning ? 'Hentikan pemindaian' : 'Mulai pindai barcode'}
              </button>
              <p className="scanner-status" id="pin-error" aria-live="polite">{error || scanStatus}</p>
            </div>
          )}
          <p className="date-stamp">06 · 12 · 2026 <span>♡</span></p>
        </section>
      ) : (
        <section className="celebration" aria-label="Perayaan anniversary">
          <header className="site-header">
            <div className="brand"> M & S <span className="brand-divider" /> <span>03</span></div>
            <p>OUR LOVE STORY</p>
            <button className="audio-control" onClick={toggleMusic} aria-label={playing ? 'Jeda musik' : 'Putar musik'}>{playing ? <Pause size={14} /> : <Play size={14} />} <span>{playing ? 'PLAYING' : 'PLAY MUSIC'}</span></button>
          </header>

          <div className="hero-content reveal-on-scroll reveal-hero">
            <p className="eyebrow hero-eyebrow"><Sparkles size={13} /> 06 DECEMBER 2026</p>
            <h1>Happy 3rd<br /><em>Anniversary.</em></h1>
            <p className="hero-note">Tiga tahun, ribuan cerita,<br />dan masih kamu — selalu kamu.</p>
            <div className="hero-moon moon" aria-hidden="true"><div className="moon-cutout" /></div>
            <a 
                className="scroll-cue" 
                href="#memories" 
                style={{ 
                  marginTop: '170px', 
                  display: 'flex', 
                  flexDirection: 'column', 
                  alignItems: 'center', 
                  marginLeft: 'auto', 
                  marginRight: 'auto',
                  width: 'fit-content'
                }}
              >
            SCROLL TO OUR MEMORIES <ChevronDown size={15} />
          </a>
          </div>

          <div className="content-shell">
            <section className="favorite-music reveal-on-scroll" aria-labelledby="favorite-music-title">
              <div className="favorite-music-copy">
                <p className="section-kicker"><Music size={13} /> OUR FAVORITE SOUNDTRACK</p>
                <h2 id="favorite-music-title">Music for<br /><em>our little world.</em></h2>
                <p>Karena ada beberapa lagu yang selalu berhasil membawaku kembali ke kamu.</p>
              </div>
              <div className="music-player">
                <div className={`music-record ${playing ? 'is-playing' : ''}`} aria-hidden="true"><Music size={26} /></div>
                <div className="music-track"><span>NOW PLAYING</span><strong>{musicTracks[selectedTrack].title}</strong><small>{musicTracks[selectedTrack].artist} · for M &amp; S</small></div>
                <button className="music-play" onClick={toggleMusic} aria-label={playing ? 'Jeda musik favorit' : 'Putar musik favorit'}>{playing ? <Pause size={19} /> : <Play size={19} />}</button>
              </div>
              <div className="music-playlist" aria-label="Pilih lagu favorit">
                {musicTracks.map((track, index) => <button className={`track-option ${selectedTrack === index ? 'is-selected' : ''}`} key={track.title} onClick={() => selectTrack(index)} aria-pressed={selectedTrack === index}><span>0{index + 1}</span><strong>{track.title}</strong><small>{track.artist}</small></button>)}
              </div>
            </section>
            <section className="intro-section reveal-on-scroll" id="memories">
              <div><p className="section-kicker">A FEW OF MY FAVORITE THINGS</p><h2>Small moments,<br /><em>big feelings.</em></h2></div>
              <p className="section-description">Kalau cinta adalah perjalanan, maka setiap foto ini adalah tempat-tempat favoritku bersamamu.</p>
            </section>
            <div className="memory-grid">
              {memories.map((memory, index) => <figure className={`memory-card reveal-on-scroll reveal-delay-${index + 1} ${memory.className}`} key={memory.src}><img src={memory.src} alt={memory.alt} /><figcaption>0{index + 1}</figcaption></figure>)}
            </div>

            <section className="letter-section reveal-on-scroll">
              <div className="letter-label"><span className="line" /> A LETTER FOR YOU</div>
              <div className={`letter-invitation ${letterOpened ? 'is-open' : ''}`}>
                <button className="letter-envelope" onClick={() => setLetterOpened(true)} aria-expanded={letterOpened} aria-controls="love-letter" aria-label={letterOpened ? 'Surat sudah terbuka' : 'Buka surat cinta'}>
                  <span className="letter-envelope-flap" />
                  <span className="letter-envelope-body" />
                  
                  <span className="letter-seal"><Heart size={20} fill="currentColor" /></span>
                </button>
                <article className="letter-card" id="love-letter">
                  <div className="letter-top"><span>TO MY FAVORITE PERSON</span><Heart size={18} fill="currentColor" /></div>
                  <p className="letter-greeting">Untuk kamu,</p>
                  <p className="letter-body">Terima kasih sudah menjadi rumah paling hangat di setiap musimku. Bersamamu, hal-hal sederhana terasa seperti perayaan — tawa kecil, perjalanan tanpa tujuan, bahkan diam yang tidak pernah terasa canggung.</p>
                  <p className="letter-body">Tiga tahun berlalu, tapi setiap hari bersamamu masih terasa seperti menemukan bintang baru di langit yang sama. Aku memilihmu, kemarin, hari ini, dan di semua hari yang akan datang.</p>
                  <p className="letter-sign">Selamanya milikmu,<br /><em>— R</em></p>
                </article>
              </div>
            </section>

            <section className="counter-section reveal-on-scroll">
              <div className="counter-copy"><p className="section-kicker">AND THE COUNT GOES ON</p><h2>3 years of<br /><em>choosing you.</em></h2></div>
              <div className="counter-grid"><div><strong>03</strong><span>YEARS</span></div><div><strong>36</strong><span>MONTHS</span></div><div><strong>1,095</strong><span>DAYS</span></div></div>
            </section>
          </div>
          <footer className="site-footer"><Heart size={14} fill="currentColor" /> Made with all my love <span>♡</span></footer>
          <button className="floating-audio" onClick={() => setMuted(!muted)} aria-label={muted ? 'Nyalakan suara' : 'Matikan suara'}>{muted ? <VolumeX size={18} /> : <Volume2 size={18} />}</button>
        </section>
      )}
    </main>
  )
}
