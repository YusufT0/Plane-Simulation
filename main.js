import * as THREE from './Common/three.module.js';
import { GLTFLoader } from './Common/GLTFLoader.js';


const canvas = document.getElementById('webgl-canvas');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x202020);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 50, -60);
camera.lookAt(0, 0, 50);
const renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;


let score = 0;
let best_score = 0;
const cubes = [];
const grounds = [];
const fuels = [];
let plane_fuel = 100;
const fuelMaterial = new THREE.MeshStandardMaterial({ color: 0xff6600 });
const colliders = [];
const occupiedPositions = new Set();
const processedGrids = new Set();
const gridSpacing = 15; 
const generateRadius = 15;
const gravity = 0.2;
const fpsCounter = document.getElementById('fpsCounter');
let explosionTextures = [];
let explosionTexturesLoaded = false;
const textureLoader = new THREE.TextureLoader();
const asphaltTexture = textureLoader.load('assets/sp.jpg');
const asphaltNormal = textureLoader.load('assets/sp.jpg'); // aynıysa problem değil
let model = null;
let fuelCount = 0;
const maxFuel = 5;


// let silhouette = null;
// let preloadedSilhouette = null;


let preloadedGround = null;
let preloadedFuel = null;
const preloadedBuildings = [];

let throttle = 0; // 0 ile 1 arasında değer alıyor
const minVolume = 0.2;
const maxVolume = 1.0;
const minPitch = 0.5;
const maxPitch = 2.0;

asphaltTexture.wrapS = THREE.RepeatWrapping;
asphaltTexture.wrapT = THREE.RepeatWrapping;
asphaltTexture.repeat.set(10, 10);

asphaltNormal.wrapS = THREE.RepeatWrapping;
asphaltNormal.wrapT = THREE.RepeatWrapping;
asphaltNormal.repeat.set(10, 10);
const textures = [
  textureLoader.load('assets/building.jpg'),
  textureLoader.load('assets/building2.png'),
];

const listener = new THREE.AudioListener();
camera.add(listener);
const sound = new THREE.Audio(listener);
const audioLoader = new THREE.AudioLoader();

let airplaneBuffer = null;
let soundStarted = false;

audioLoader.load('sounds/airplane_sound.wav', function(buffer) {
  airplaneBuffer = buffer;
});

// Kullanıcı Space'e basarsa sesi başlat
window.addEventListener('keydown', function (event) {
  if (event.code === 'Space' && !soundStarted && airplaneBuffer) {
    if (THREE.AudioContext && THREE.AudioContext.getContext) {
      THREE.AudioContext.getContext().resume().then(() => {
        sound.setBuffer(airplaneBuffer);
        sound.setLoop(true);
        sound.setVolume(minVolume); // minVolume tanımlı olmalı
        sound.play();
        soundStarted = true;
      });
    }
  }
});

const loader = new GLTFLoader();

// loader.load('assets/passenger_plane.gltf', (gltf) => {
//   model = gltf.scene;
//   model.scale.set(0.03, 0.03, 0.03);
  
//   model.position.set(0, 60, 0); // Y pozisyonunu yükselttim
  

//   scene.add(model);
// }, undefined, (error) => {
//   console.error('Model yükleme hatası:', error);
// });

function loadPlaneModel() {
  loader.load('assets/passenger_plane.gltf', (gltf) => {
    model = gltf.scene;
    model.scale.set(0.03, 0.03, 0.03);
    model.position.set(0, 60, 0);
    model.quaternion.set(0, 0, 0, 1);
    scene.add(model);
  }, undefined, (error) => {
    console.error('Model loading error:', error);
  });
}

loadPlaneModel();

// function generateSilhouetteBase(gltfScene) {
//   const silhouette = gltfScene.clone(true);
//   silhouette.scale.set(0.03, 0.03, 0.03);

//   silhouette.traverse((child) => {
//     if (child.isMesh) {
//       const edges = new THREE.EdgesGeometry(child.geometry);
//       const lineMaterial = new THREE.LineBasicMaterial({
//         color: 0x00ff00,
//         transparent: true,
//         opacity: 1.0
//       });
//       const wireframe = new THREE.LineSegments(edges, lineMaterial);

//       child.material = new THREE.MeshBasicMaterial({
//         transparent: true,
//         opacity: 0,
//         color: 0xffffff
//       });

//       child.add(wireframe);
//     }
//   });

//   return silhouette;
// }

// loader.load('assets/passenger_plane.gltf', (gltf) => {
//   preloadedSilhouette = generateSilhouetteBase(gltf.scene);
// });


function preloadExplosionTextures() {
  const totalFrames = 60;
  let loadedCount = 0;
  
  console.log("Loading explosion textures...");
  
  for (let i = 1; i <= totalFrames; i++) {
    const loader = new THREE.TextureLoader();
    const frameNumber = i.toString().padStart(4, '0'); // 0001, 0002, vs.
    
    loader.load(
      `assets/explosion/explosion${frameNumber}.png`, // Dosya yolu: assets/explosion/explosion0001.png, explosion0002.png, vs.
      (texture) => {
        explosionTextures[i - 1] = texture;
        loadedCount++;
        
        if (loadedCount === totalFrames) {
          explosionTexturesLoaded = true;
          console.log("All explosion textures loaded successfully!");
        }
      },
      undefined,
      (error) => {
        console.error(`Failed to load explosion frame explosion${frameNumber}.png:`, error);
      }
    );
  }
}


function preloadGround() {
  const groundGeo = new THREE.PlaneGeometry(gridSpacing, gridSpacing);
  const groundMat = new THREE.MeshStandardMaterial({
    map: asphaltTexture,
    roughness: 0.9,
    metalness: 0.1,
  });
  preloadedGround = new THREE.Mesh(groundGeo, groundMat);
  preloadedGround.rotation.x = -Math.PI / 2;
  preloadedGround.receiveShadow = true;
}

function preloadFuel() {
  const geometry = new THREE.SphereGeometry(4, 16, 16);
  preloadedFuel = new THREE.Mesh(geometry, fuelMaterial);
}

preloadFuel();


function createFuel(x, z) {
  const fuel = preloadedFuel.clone();
  const y = 5;
  fuel.position.set(x, y, z);
  fuel.initialY = y; // Başlangıç yüksekliğini sakla
  scene.add(fuel);
  fuels.push(fuel);
}

function isNearBuilding(x, z, threshold = gridSpacing / 2) {
  return cubes.some(cube => {
    const dx = cube.position.x - x;
    const dz = cube.position.z - z;
    return Math.abs(dx) < threshold && Math.abs(dz) < threshold;
  });
}

function preloadBuildings() {
  for (let i = 0; i < 10; i++) {
    const w = 8 + Math.random() * 4;
    const h = 15 + Math.random() * 35;
    const d = 8 + Math.random() * 4;

    const geometry = new THREE.BoxGeometry(w, h, d);

    // UV scale
    const scaleX = w / 10;
    const scaleY = h / 10;
    const scaleZ = d / 10;
    const uvs = geometry.attributes.uv.array;

    for (let j = 0; j < uvs.length; j += 2) {
      const faceIndex = Math.floor(j / 8);
      if (faceIndex === 0 || faceIndex === 1) {
        uvs[j] *= scaleX;
        uvs[j + 1] *= scaleY;
      } else if (faceIndex === 2 || faceIndex === 3) {
        uvs[j] *= scaleX;
        uvs[j + 1] *= scaleZ;
      } else {
        uvs[j] *= scaleZ;
        uvs[j + 1] *= scaleY;
      }
    }
    geometry.attributes.uv.needsUpdate = true;

    const chosenTexture = textures[Math.floor(Math.random() * textures.length)];
    const blackMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff});
    const buildingMaterial = new THREE.MeshStandardMaterial({ map: chosenTexture });

    const materials = [
      buildingMaterial, // +X
      buildingMaterial, // -X
      blackMaterial,    // +Y (TOP)
      buildingMaterial, // -Y
      buildingMaterial, // +Z
      buildingMaterial  // -Z
    ];

    const cube = new THREE.Mesh(geometry, materials);
    cube.castShadow = true;
    cube.receiveShadow = true;

    preloadedBuildings.push(cube);
  }
}
preloadGround();
preloadBuildings();
preloadExplosionTextures();

function createExplosion(position) {
  console.log("Creating explosion at:", position);
  
  if (!explosionTexturesLoaded) {
    console.warn("Explosion textures not loaded yet");
    return;
  }

  const material = new THREE.SpriteMaterial({ 
    map: explosionTextures[0],
    transparent: true,
    alphaTest: 0.01,
    blending: THREE.AdditiveBlending,
    depthTest: false,
    depthWrite: false
  });
  
  const explosionSound = new THREE.Audio(listener);
  const audioLoader = new THREE.AudioLoader();
  audioLoader.load('sounds/explosion.mp3', function(buffer) {
    explosionSound.setBuffer(buffer);
    explosionSound.setVolume(1.0);
    explosionSound.play();
    console.log("Explosion sound played!");
    sound.stop();
    
    // IMPORTANT: Dispose of sound after playing
    setTimeout(() => {
      explosionSound.disconnect();
      if (explosionSound.buffer) {
        explosionSound.buffer = null;
      }
    }, 5000); // Clean up after 5 seconds
  });

  const sprite = new THREE.Sprite(material);
  sprite.scale.set(5, 5, 1);
  
  const cameraDirection = new THREE.Vector3();
  camera.getWorldDirection(cameraDirection);
  
  const explosionPosition = camera.position.clone().add(cameraDirection.multiplyScalar(50));
  sprite.position.copy(explosionPosition);
  sprite.material.sizeAttenuation = false;
  
  scene.add(sprite);

  let currentFrame = 0;
  const totalFrames = explosionTextures.length;
  let animationId; // Track animation ID for cleanup
  
  const animate = () => {
    if (currentFrame >= totalFrames) {
      console.log("Explosion animation complete, removing sprite");
      scene.remove(sprite);
      
      // IMPORTANT: Properly dispose of sprite material
      material.dispose();
      
      // Clear animation reference
      if (animationId) {
        cancelAnimationFrame(animationId);
      }
      return;
    }

    material.map = explosionTextures[currentFrame];
    material.needsUpdate = true;
    
    currentFrame++;
    
    // Use requestAnimationFrame instead of setTimeout for better performance
    setTimeout(() => {
      animationId = requestAnimationFrame(animate);
    }, 10);
  };

  animate();
}


// const silhouettes = [];
// const maxSilhouettes = 4;

// // Collision kontrol fonksiyonu (çok basit, daha gelişmiş istersen genişletiriz)
// function isNearBuildingOrGround(x, z, minDist = 3) {
//   for (const obj of [...cubes, ...grounds]) {
//     const dx = obj.position.x - x;
//     const dz = obj.position.z - z;
//     const distance = Math.sqrt(dx * dx + dz * dz);
//     if (distance < minDist) return true;
//   }
//   return false;
// }

// function createSilhouette(x, z) {
//   if (!preloadedSilhouette) return;
//   const pos_groups = [-Math.PI / 2, -Math.PI / 4, 0, Math.PI / 4, Math.PI / 2]
//   const random_rot_x = pos_groups[Math.floor(Math.random() * pos_groups.length)];
//   const random_rot_z = pos_groups[Math.floor(Math.random() * pos_groups.length)];

//   const silhouette = preloadedSilhouette.clone(true);
//   silhouette.position.set(x, 10, z);
//   silhouette.rotation.y += (random_rot_x);
//   silhouette.rotation.z += (random_rot_z);
//   scene.add(silhouette);
//   silhouettes.push(silhouette);
// }

function createGround(x, z) {
  if (!preloadedGround) return;
  
  const ground = preloadedGround.clone();
  ground.position.set(x, 0, z);
  scene.add(ground);
  grounds.push(ground);
  colliders.push(ground);
}




textures.forEach(tex => {
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearFilter;
  tex.anisotropy = 1;
});

function createBuilding(x, z) {
  const original = preloadedBuildings[Math.floor(Math.random() * preloadedBuildings.length)];
  const cube = original.clone(true); // Deep clone
  const h = cube.geometry.parameters.height;
  cube.position.set(x, h / 2, z);
  scene.add(cube);
  cubes.push(cube);

  const w = cube.geometry.parameters.width;
  const d = cube.geometry.parameters.depth;

  const colliderBox = new THREE.BoxGeometry(w * 0.4, h, d * 0.6);
  const colliderMesh = new THREE.Mesh(
    colliderBox,
    new THREE.MeshBasicMaterial({ visible: false })
  );
  colliderMesh.position.set(x, h / 2, z);
  colliders.push(colliderMesh);
  scene.add(colliderMesh);
}


function generateCitySegment(centerX, centerZ, gridRadius) {
  const gridSize = gridSpacing;
  
  const minX = Math.floor(centerX / gridSize - gridRadius) * gridSize;
  const maxX = Math.floor(centerX / gridSize + gridRadius) * gridSize;
  const minZ = Math.floor(centerZ / gridSize - gridRadius) * gridSize;
  const maxZ = Math.floor(centerZ / gridSize + gridRadius) * gridSize;
  
  
  
  for (let x = minX; x <= maxX; x += gridSize) {
    for (let z = minZ; z <= maxZ; z += gridSize) {
      const gridKey = `${x},${z}`;
      

      if (processedGrids.has(gridKey)) {
        continue;
      }

      
      if (fuelCount < maxFuel) {

        const offsetX = x + (Math.random() - 0.5) * gridSpacing;
        const offsetZ = z + (Math.random() - 0.5) * gridSpacing;
        if (!isNearBuilding(offsetX, offsetZ)) {
            createFuel(offsetX, offsetZ);
        }
        fuelCount++;
      }
      
      // Grid'i işlenmiş olarak işaretle
      processedGrids.add(gridKey);
      
      const groundKey = `${gridKey}_ground`;
      const buildingKey = gridKey;
      
      // Create ground if not exists
      if (!occupiedPositions.has(groundKey)) {
        occupiedPositions.add(groundKey);
        createGround(x, z);
      }
      
      // Create building with much lower probability (maksimum 3 per grid)
      if (!occupiedPositions.has(buildingKey)) {
        // Don't place buildings at exact center
        if (!(x === 0 && z === 0) && Math.random() > 0.85) { // Çok daha az bina
          occupiedPositions.add(buildingKey);
          createBuilding(x, z);
        }
      }



      // if (silhouettes.length < maxSilhouettes && Math.random() > 0.5) {
      //   const offsetX = x + (Math.random() - 0.5) * gridSpacing;
      //   const offsetZ = z + (Math.random() - 0.5) * gridSpacing;

      //   if (!isNearBuildingOrGround(offsetX, offsetZ)) {
      //     createSilhouette(offsetX, offsetZ);
      //   }
      // }
    }
  }
  
}

function cleanupObjects(centerX, centerZ, gridRadius) {
  const cleanup = (gridRadius + 5) * gridSpacing;
  
  // Clean up buildings with proper disposal
  for (let i = cubes.length - 1; i >= 0; i--) {
    const dx = Math.abs(cubes[i].position.x - centerX);
    const dz = Math.abs(cubes[i].position.z - centerZ);
    
    if (dx > cleanup || dz > cleanup) {
      const cube = cubes[i];
      const key = `${cube.position.x},${cube.position.z}`;
      
      // IMPORTANT: Dispose of geometry and materials
      if (cube.geometry) cube.geometry.dispose();
      if (cube.material) {
        if (Array.isArray(cube.material)) {
          cube.material.forEach(mat => mat.dispose());
        } else {
          cube.material.dispose();
        }
      }
      
      occupiedPositions.delete(key);
      scene.remove(cube);
      cubes.splice(i, 1);
      processedGrids.delete(key);
    }
  }

  // Clean up silhouettes with proper disposal
  // for (let i = silhouettes.length - 1; i >= 0; i--) {
  //   const dx = Math.abs(silhouettes[i].position.x - centerX);
  //   const dz = Math.abs(silhouettes[i].position.z - centerZ);

  //   if (dx > cleanup || dz > cleanup) {
  //     const silhouette = silhouettes[i];
      
  //     // Dispose of silhouette materials and geometries
  //     silhouette.traverse((child) => {
  //       if (child.geometry) child.geometry.dispose();
  //       if (child.material) {
  //         if (Array.isArray(child.material)) {
  //           child.material.forEach(mat => mat.dispose());
  //         } else {
  //           child.material.dispose();
  //         }
  //       }
  //     });
      
  //     scene.remove(silhouette);
  //     silhouettes.splice(i, 1);
  //   }
  // }
  
  // Clean up grounds with proper disposal
  for (let i = grounds.length - 1; i >= 0; i--) {
    const dx = Math.abs(grounds[i].position.x - centerX);
    const dz = Math.abs(grounds[i].position.z - centerZ);
    
    if (dx > cleanup || dz > cleanup) {
      const ground = grounds[i];
      const key = `${ground.position.x},${ground.position.z}_ground`;
      const gridKey = `${ground.position.x},${ground.position.z}`;
      
      // Dispose of ground geometry and material
      if (ground.geometry) ground.geometry.dispose();
      if (ground.material) ground.material.dispose();
      
      occupiedPositions.delete(key);
      scene.remove(ground);
      grounds.splice(i, 1);
      processedGrids.delete(gridKey);
    }
  }

  // Clean up colliders with proper disposal
  for (let i = colliders.length - 1; i >= 0; i--) {
    const collider = colliders[i];
    const dx = Math.abs(collider.position.x - centerX);
    const dz = Math.abs(collider.position.z - centerZ);
    
    if (dx > cleanup || dz > cleanup) {
      // Dispose of collider geometry and material
      if (collider.geometry) collider.geometry.dispose();
      if (collider.material) collider.material.dispose();
      
      scene.remove(collider);
      colliders.splice(i, 1);
    }
  }

  for (let i = fuels.length - 1; i >= 0; i--) {
    const fuel = fuels[i];
    const dx = Math.abs(fuel.position.x - centerX);
    const dz = Math.abs(fuel.position.z - centerZ);
    
    if (dx > cleanup || dz > cleanup) {
      if (fuel.geometry) fuel.geometry.dispose();
      if (fuel.material) fuel.material.dispose();
      scene.remove(fuel);
      fuels.splice(i, 1);
      fuelCount--;

    }
  }
}

function checkAndGenerateAhead(cameraX, cameraZ, gridRadius) {
  // Generate content in square grid around camera
  generateCitySegment(cameraX, cameraZ, gridRadius);
  
  // Clean up objects outside the render area
  cleanupObjects(cameraX, cameraZ, gridRadius);
}

function initializeCity() {
  // Generate larger initial grid
  checkAndGenerateAhead(0, 0, generateRadius);
}

const sun = new THREE.DirectionalLight(0xffffff, 1.2);
sun.position.set(100, 200, 100); // yukarıdan ve çaprazdan gelsin
sun.castShadow = true;

// Shadow ayarları (daha keskin ve düzgün gölgeler için)
sun.shadow.mapSize.width = 2048;
sun.shadow.mapSize.height = 2048;
sun.shadow.camera.near = 0.5;
sun.shadow.camera.far = 500;
sun.shadow.camera.left = -200;
sun.shadow.camera.right = 200;
sun.shadow.camera.top = 200;
sun.shadow.camera.bottom = -200;

scene.add(sun);

scene.add(sun.target); // target ayrı olarak sahneye eklenmeli

const slider = document.getElementById("throttle-slider");
  slider.addEventListener("input", () => {
    const brightness = slider.value / 100; // 0.0 - 1.0 arası normalize ettik
    sun.intensity = brightness * 2; // Maks 2 yapalım ki daha etkili olsun
  });

// Güneş küresi (temsilci)
const sunGeo = new THREE.SphereGeometry(5, 32, 32);
const sunMat = new THREE.MeshBasicMaterial({ color: 0xffcc00, emissive: 0xffaa00 });
const sunMesh = new THREE.Mesh(sunGeo, sunMat);
scene.add(sunMesh);

const ambient = new THREE.AmbientLight(0xffffff, 0.3);
scene.add(ambient);



let keyAccPressed = false;
let keyWPressed = false;
let keyDPressed = false;
let keyAPressed = false;
let keySPressed = false;
let keyQPressed = false;
let keyEPressed = false;
let keyRPressed = false;

window.addEventListener('keydown', (e) => {
  if (e.key === ' ') keyAccPressed = true;
  if (e.key === 'w') keyWPressed = true;
  if (e.key === 'd') keyDPressed = true;
  if (e.key === 'a') keyAPressed = true;
  if (e.key === 's') keySPressed = true;
  if (e.key === 'q') keyQPressed = true;
  if (e.key === 'e') keyEPressed = true;
  if (e.key === 'r') restartSimulation();
});

window.addEventListener('keyup', (e) => {
  if (e.key === ' ') keyAccPressed = false;
  if (e.key === 'w') keyWPressed = false;
  if (e.key === 'd') keyDPressed = false;
  if (e.key === 'a') keyAPressed = false;
  if (e.key === 's') keySPressed = false;
  if (e.key === 'q') keyQPressed = false;
  if (e.key === 'e') keyEPressed = false;
  if (e.key === 'r') keyRPressed = false;
});

window.addEventListener('keydown', (e) => keys[e.code] = true);
window.addEventListener('keyup', (e) => keys[e.code] = false);


let velocity = 0;
let maxSpeed = 1.5; // Biraz hızlandırdım
let acceleration = 0.005;
let deceleration = 0.002;

// Son generate edilen pozisyonu takip et
let lastGenerateX = 0;
let lastGenerateZ = 0;
let lastTime = performance.now();
let frames = 0;
const generateThreshold = gridSpacing * 2; // Ne kadar hareket ettikten sonra yeni generate

const sunSpeed = 2;
const sunOffset = new THREE.Vector3(100, 200, 100); // Başlangıç offset
const keys = {};

function updateSunOffset() {
  if (keys['ArrowUp'])    sunOffset.z -= sunSpeed;
  if (keys['ArrowDown'])  sunOffset.z += sunSpeed;
  if (keys['ArrowLeft'])  sunOffset.x -= sunSpeed;
  if (keys['ArrowRight']) sunOffset.x += sunSpeed;
}


const modelBox = new THREE.Box3();
// const modelBoxHelper = new THREE.Box3Helper(modelBox, 0xff0000);
// scene.add(modelBoxHelper);

function handleCollisions() {
  if (!model) return;
  
  modelBox.setFromObject(model);
  modelBox.expandByScalar(-5);

  for (const collider of colliders) {
    const colliderBox = new THREE.Box3().setFromObject(collider);
    if (modelBox.intersectsBox(colliderBox)) {
      createExplosion(model.position.clone());
      scene.remove(model);
      model = null;
      velocity = 0;
      return;
    }
  }
}

function gravitional_pull(){
  model.position.y -= gravity;
}


function updateHUD() {
  // Update velocity display
  const velocityElement = document.getElementById('velocity');
  const velocityGauge = document.getElementById('velocity-gauge');
  const scoreElement = document.getElementById('score');
  const bestscoreElement = document.getElementById('best-score');
  
  if (velocityElement) {
    velocityElement.textContent = Math.round(velocity * 100);
  }
  
  // Update velocity gauge (assuming max velocity is 300 km/h for gauge calculation)
  if (velocityGauge) {
    const maxVelocity = 300;
    const velocityPercentage = Math.min((velocity / maxVelocity) * 100, 100);
    velocityGauge.style.width = velocityPercentage + '%';
  }
  
  // Update fuel display
  const fuelElement = document.getElementById('fuel');
  const fuelGauge = document.getElementById('fuel-gauge');
  
  if (fuelElement) {
    fuelElement.textContent = Math.round(plane_fuel);
  }
  
  // Update fuel gauge
  if (fuelGauge) {
    fuelGauge.style.width = plane_fuel + '%';
    
    // Change fuel gauge color based on fuel level
    if (plane_fuel > 50) {
      fuelGauge.style.backgroundColor = '#00ff88'; // Green
    } else if (plane_fuel > 25) {
      fuelGauge.style.backgroundColor = '#ffaa00'; // Orange
    } else {
      fuelGauge.style.backgroundColor = '#ff4444'; // Red
    }
  }
  scoreElement.textContent = score;
  bestscoreElement.textContent = best_score;
}

function restartSimulation() {  
  // Clear all generated objects
  cubes.forEach(cube => scene.remove(cube));
  cubes.length = 0;
  
  grounds.forEach(ground => scene.remove(ground));
  grounds.length = 0;

  fuels.forEach(fuel => scene.remove(fuel));
  fuels.length = 0;

  
  colliders.length = 0;
  
  // Clear tracking sets
  occupiedPositions.clear();
  processedGrids.clear();
  
  // CRITICAL: Remove ALL plane models from scene
  // Find and remove all GLTF models (they usually have specific characteristics)
  const modelsToRemove = [];
  scene.traverse((child) => {
    // Check if this is a GLTF scene (our plane)
    if (child.type === 'Group' && child.scale.x === 0.03) {
      modelsToRemove.push(child);
    }
  });
  
  modelsToRemove.forEach(modelToRemove => {
    scene.remove(modelToRemove);
  });
  
  // Also remove the current model reference if it exists
  if (model) {
    scene.remove(model);
    model = null;
  }
  
  velocity = 0;
  lastGenerateX = 0;
  lastGenerateZ = 0;
  fuelCount = 0;
  plane_fuel = 100;
  if (score > best_score){
    best_score = score;
    updateHUD();
  }
  score = 0;
  sound.play();
  
  // Reset all key states
  keyAccPressed = false;
  keyWPressed = false;
  keyDPressed = false;
  keyAPressed = false;
  keySPressed = false;
  keyQPressed = false;
  keyEPressed = false;
  
  // Load new model using the same function
  loadPlaneModel();
  
  // Reinitialize the city
  initializeCity();
  
  console.log("=== RESTART SIMULATION END ===");
}

function animate(time) {
  requestAnimationFrame(animate);
  if (!model) {
    renderer.render(scene, camera);
    return;
  }// Zeminle çakışma: yere batmasın
  
  // Hız güncellemesi
  if (keyAccPressed && plane_fuel > 0) {
    velocity += acceleration;
    updateHUD();
    plane_fuel-=0.2;
    velocity = Math.min(velocity, maxSpeed);
  } else {
    velocity -= deceleration;
    updateHUD();
    velocity = Math.max(velocity, 0);
  }

  // Dönüş inputları - Quaternion ile
  const rotationStep = 0.02;
  
  // Pitch (burun yukarı/aşağı) - X ekseni etrafında döndürme
  if (keyWPressed) {
    const pitchQuaternion = new THREE.Quaternion();
    pitchQuaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -rotationStep);
    model.quaternion.multiplyQuaternions(model.quaternion, pitchQuaternion);
  }
  if (keySPressed) {
    const pitchQuaternion = new THREE.Quaternion();
    pitchQuaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), rotationStep);
    model.quaternion.multiplyQuaternions(model.quaternion, pitchQuaternion);
  }

  // Yaw (sola/sağa dönüş) - Y ekseni etrafında döndürme
  if (keyDPressed) {
    const yawQuaternion = new THREE.Quaternion();
    yawQuaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -rotationStep);
    model.quaternion.multiplyQuaternions(model.quaternion, yawQuaternion);
  }
  if (keyAPressed) {
    const yawQuaternion = new THREE.Quaternion();
    yawQuaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotationStep);
    model.quaternion.multiplyQuaternions(model.quaternion, yawQuaternion);
  }

  if (keyQPressed) {
    const rollQuaternion = new THREE.Quaternion();
    rollQuaternion.setFromAxisAngle(new THREE.Vector3(0, 0, 1), rotationStep);
    model.quaternion.multiplyQuaternions(model.quaternion, rollQuaternion);
  }
  if (keyEPressed) {
    const rollQuaternion = new THREE.Quaternion();
    rollQuaternion.setFromAxisAngle(new THREE.Vector3(0, 0, 1), -rotationStep);
    model.quaternion.multiplyQuaternions(model.quaternion, rollQuaternion);
  }

  // İleri hareket - uçağın kendi yönünde
  const forward = new THREE.Vector3(0, 0, 1);
  forward.applyQuaternion(model.quaternion);
  model.position.add(forward.clone().multiplyScalar(velocity));
  gravitional_pull()
  handleCollisions()

  // Uçak pozisyonuna göre şehir generate et
  const currentX = model.position.x;
  const currentZ = model.position.z;

  const normalized = Math.min(velocity / maxSpeed, 1); // 0-1 arası

  const volume = minVolume + (maxVolume - minVolume) * normalized;
  const pitch = minPitch + (maxPitch - minPitch) * normalized;

  sound.setVolume(volume);
  sound.playbackRate = pitch;

  // Belirli bir mesafe hareket ettikten sonra yeni alan generate et
  const distanceMoved = Math.sqrt(
    Math.pow(currentX - lastGenerateX, 2) + 
    Math.pow(currentZ - lastGenerateZ, 2)
  );
  
  if (distanceMoved > generateThreshold) {
    checkAndGenerateAhead(currentX, currentZ, generateRadius);
    lastGenerateX = currentX;
    lastGenerateZ = currentZ;
  }
    // FPS hesapla
  const now = performance.now();
  frames++;
  if (now - lastTime >= 1000) {
    const fps = Math.round((frames * 1000) / (now - lastTime));
    fpsCounter.innerText = `${fps}`;
    frames = 0;
    lastTime = now;
  }

  const t = time * 0.001; // saniyeye çevir

  fuels.forEach(fuel => {
    fuel.position.y = fuel.initialY + Math.sin(t * 5) * 1.5; // yumuşak zıplama
  });

  for (let i = fuels.length - 1; i >= 0; i--) {
  const fuel = fuels[i];
  const dx = model.position.x - fuel.position.x;
  const dy = model.position.y - fuel.position.y;
  const dz = model.position.z - fuel.position.z;
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

  if (dist < 10) { // temas mesafesi
    if (fuel.geometry) fuel.geometry.dispose();
    if (fuel.material) fuel.material.dispose();
    scene.remove(fuel);
    fuels.splice(i, 1);
    fuelCount--;
    plane_fuel += 100;
    score += 10;
    updateHUD();
    }
  }

  
  const up = new THREE.Vector3(0, 1, 0);
  up.applyQuaternion(model.quaternion);
  updateSunOffset(); // önce offset güncelle

  const sunPos = model.position.clone().add(sunOffset);
  sun.position.copy(sunPos);
  sun.target.position.copy(model.position);
  sun.target.updateMatrixWorld();
  sunMesh.position.copy(sunPos);
  
  
  const camOffset = forward.clone().multiplyScalar(-40).add(up.clone().multiplyScalar(15));
  const camPosition = model.position.clone().add(camOffset);


  camera.position.copy(camPosition);

  const lookAtTarget = model.position.clone().add(forward.clone().multiplyScalar(50));
  camera.lookAt(lookAtTarget);
  
  
  
  renderer.render(scene, camera);
}

  
// Oyunu başlat
initializeCity();
animate();