'use client'

import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'

type CurtainPanel = {
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>
  basePositions: Float32Array
  side: number
}

type CurtainScene = {
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.OrthographicCamera
  panels: CurtainPanel[]
  stageHeight: number
}

const createCurtainGeometry = (width: number, height: number) => {
  const geometry = new THREE.PlaneGeometry(width, height, 48, 40)
  const positions = geometry.attributes.position
  const colors: number[] = []

  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index)
    const fold = Math.cos((x / width) * Math.PI * 12)
    const highlight = (fold + 1) / 2
    positions.setZ(index, fold * 0.075 + Math.cos((x / width) * Math.PI * 24) * 0.018)
    colors.push(0.34 + highlight * 0.42, 0.025 + highlight * 0.075, 0.065 + highlight * 0.11)
  }

  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  geometry.computeVertexNormals()
  return geometry
}

export function AlbumCurtain3D({ revealed }: { revealed: boolean }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<CurtainScene | null>(null)
  const [useFallback, setUseFallback] = useState(false)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true })
    } catch (cause) {
      console.error('Unable to initialize the Three.js album curtain; using CSS fallback.', cause)
      setUseFallback(true)
      return
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5))
    renderer.setClearColor(0x000000, 0)
    host.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    scene.add(new THREE.AmbientLight(0xffe6d0, 2.1))

    const keyLight = new THREE.DirectionalLight(0xffd5bd, 3.2)
    keyLight.position.set(-3, 5, 8)
    scene.add(keyLight)

    const fillLight = new THREE.DirectionalLight(0x9b2439, 1.3)
    fillLight.position.set(5, -2, 5)
    scene.add(fillLight)

    const camera = new THREE.OrthographicCamera(-5, 5, 3, -3, 0.1, 50)
    camera.position.z = 20

    const material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      vertexColors: true,
      roughness: 0.83,
      metalness: 0,
      side: THREE.DoubleSide,
    })
    const panels: CurtainPanel[] = []
    const sceneState: CurtainScene = { renderer, scene, camera, panels, stageHeight: 6 }
    sceneRef.current = sceneState

    const resize = () => {
      const { width, height } = host.getBoundingClientRect()
      if (!width || !height) return

      const stageHeight = 10 * (height / width)
      sceneState.stageHeight = stageHeight
      camera.top = stageHeight / 2
      camera.bottom = -stageHeight / 2
      camera.updateProjectionMatrix()
      renderer.setSize(width, height, false)

      panels.forEach((panel) => {
        panel.mesh.geometry.dispose()
        panel.mesh.geometry = createCurtainGeometry(5.08, stageHeight)
        panel.basePositions = new Float32Array(panel.mesh.geometry.attributes.position.array)
      })

      renderer.render(scene, camera)
    }

    for (const side of [-1, 1]) {
      const mesh = new THREE.Mesh(createCurtainGeometry(5.08, sceneState.stageHeight), material)
      mesh.position.x = side * 2.47
      scene.add(mesh)
      panels.push({
        mesh,
        basePositions: new Float32Array(mesh.geometry.attributes.position.array),
        side,
      })
    }

    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(host)
    resize()

    return () => {
      resizeObserver.disconnect()
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) object.geometry.dispose()
      })
      material.dispose()
      renderer.dispose()
      renderer.domElement.remove()
      sceneRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!revealed || !sceneRef.current) return

    const state = sceneRef.current
    const startTime = performance.now()
    let animationFrame = 0

    const animate = (now: number) => {
      const progress = Math.min((now - startTime) / 1450, 1)
      const eased = progress * progress * (3 - 2 * progress)

      state.panels.forEach(({ mesh, basePositions, side }) => {
        const geometry = mesh.geometry
        const positions = geometry.attributes.position
        const vertexCount = positions.count

        for (let index = 0; index < vertexCount; index += 1) {
          const offset = index * 3
          const x = basePositions[offset]
          const y = basePositions[offset + 1]
          const z = basePositions[offset + 2]
          const wave = Math.sin(progress * 13 + x * 2.2 + y * 1.4) * progress
          positions.setXYZ(index, x + wave * 0.045, y + wave * 0.035, z + wave * 0.12)
        }

        positions.needsUpdate = true
        geometry.computeVertexNormals()
        mesh.position.y = -state.stageHeight * 1.25 * eased
        mesh.rotation.z = side * -0.12 * Math.sin(progress * Math.PI)
        mesh.rotation.x = side * 0.08 * Math.sin(progress * Math.PI)
        mesh.material.opacity = 1 - Math.max(0, (eased - 0.7) / 0.3)
        mesh.material.transparent = true
      })

      state.renderer.render(state.scene, state.camera)
      if (progress < 1) animationFrame = window.requestAnimationFrame(animate)
    }

    animationFrame = window.requestAnimationFrame(animate)
    return () => window.cancelAnimationFrame(animationFrame)
  }, [revealed])

  return (
    <div className="album-curtain-3d" ref={hostRef} aria-hidden="true">
      {useFallback && (
        <div className={`album-curtain-fallback ${revealed ? 'is-revealed' : ''}`}>
          <span />
          <span />
        </div>
      )}
    </div>
  )
}
