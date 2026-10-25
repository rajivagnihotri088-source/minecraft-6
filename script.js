
(() => {
  const THREE = window.THREE;

  if (!THREE) {
    document.getElementById("loading").textContent =
      "Three.js load nahi hua. Internet check karke reload karo.";
    return;
  }

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x8ac9f0);
  scene.fog = new THREE.Fog(0x8ac9f0, 45, 115);

  const camera = new THREE.PerspectiveCamera(
    75, innerWidth / innerHeight, 0.1, 180
  );

  const renderer = new THREE.WebGLRenderer({
    antialias: true
  });

  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.body.appendChild(renderer.domElement);

  scene.add(new THREE.HemisphereLight(0xc8e6ff, 0x56613d, 2));

  const sun = new THREE.DirectionalLight(0xfff1d0, 2.5);
  sun.position.set(35, 60, 20);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -35;
  sun.shadow.camera.right = 35;
  sun.shadow.camera.top = 35;
  sun.shadow.camera.bottom = -35;
  scene.add(sun);

  const mat = {};
  const colors = {
    grass: 0x65b847,
    dirt: 0x795034,
    stone: 0x85898b,
    wood: 0x80502e,
    leaves: 0x2f8738,
    planks: 0xb88950,
    roof: 0x984438,
    sand: 0xdcc68b,
    water: 0x319fe0,
    coal: 0x343638,
    iron: 0xc5b5a5,
    gold: 0xffd02f,
    diamond: 0x43e6e2
  };

  for (const name in colors) {
    mat[name] = new THREE.MeshLambertMaterial({
      color: colors[name]
    });
  }

  mat.water.transparent = true;
  mat.water.opacity = 0.72;
  mat.water.depthWrite = false;

  const cube = new THREE.BoxGeometry(1, 1, 1);
  const chunks = new Map();
  const allBlocks = new Map();
  const chunkSize = 12;
  const renderDistance = 2;

  const player = {
    x: 0, y: 4, z: 0,
    vy: 0,
    grounded: false
  };

  let yaw = 0;
  let pitch = 0;
  let playing = false;
  let selected = "grass";
  let blockCount = 64;

  const keys = {};
  const inventory = {
    grass: 64, dirt: 64, stone: 32,
    wood: 32, planks: 32
  };

  const hotbar = ["grass", "dirt", "stone", "wood", "planks"];

  // Deterministic terrain variation
  function hash(x, z) {
    const n = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
    return n - Math.floor(n);
  }

  function riverDistance(x, z) {
    return Math.abs(x - Math.sin(z * 0.045) * 9 - 22);
  }

  function isRiver(x, z) {
    return riverDistance(x, z) < 3.3;
  }

  function heightAt(x, z) {
    if (Math.abs(x) < 12 && Math.abs(z) < 12) return 1;

    const h = Math.sin(x * 0.08) * 1.6 +
              Math.cos(z * 0.09) * 1.3 +
              Math.sin((x + z) * 0.04) * 1.2;

    return Math.floor(2 + h);
  }

  function blockKey(x, y, z) {
    return `${x},${y},${z}`;
  }

  function putBlock(x, y, z, type, owner) {
    x = Math.round(x);
    y = Math.round(y);
    z = Math.round(z);

    const id = blockKey(x, y, z);
    if (allBlocks.has(id)) return null;

    const material = mat[type] || mat.dirt;
    const mesh = new THREE.Mesh(cube, material);

    mesh.position.set(x, y, z);
    mesh.castShadow = type !== "water";
    mesh.receiveShadow = true;
    mesh.userData = { x, y, z, type, owner };

    scene.add(mesh);
    allBlocks.set(id, mesh);

    if (owner && chunks.has(owner)) {
      chunks.get(owner).add(mesh);
    }

    return mesh;
  }

  function removeBlock(mesh) {
    if (!mesh) return;

    const d = mesh.userData;
    allBlocks.delete(blockKey(d.x, d.y, d.z));
    scene.remove(mesh);

    if (d.owner && chunks.has(d.owner)) {
      chunks.get(d.owner).delete(mesh);
    }
  }

  function tree(x, z, owner) {
    const ground = heightAt(x, z);
    if (isRiver(x, z)) return;

    for (let y = 1; y <= 4; y++) {
      putBlock(x, ground + y, z, "wood", owner);
    }

    for (let dx = -2; dx <= 2; dx++) {
      for (let dz = -2; dz <= 2; dz++) {
        for (let dy = 3; dy <= 5; dy++) {
          if (Math.abs(dx) + Math.abs(dz) < 4) {
            putBlock(
              x + dx, ground + dy, z + dz, "leaves", owner
            );
          }
        }
      }
    }
  }

  function house(cx, cz, owner) {
    const ground = heightAt(cx, cz);

    // Wooden floor
    for (let x = -3; x <= 3; x++) {
      for (let z = -3; z <= 3; z++) {
        putBlock(cx + x, ground + 1, cz + z, "planks", owner);
      }
    }

    // Walls and doorway
    for (let y = 2; y <= 4; y++) {
      for (let n = -3; n <= 3; n++) {
        if (!(n === 0 && y <= 3)) {
          putBlock(cx + n, ground + y, cz - 3, "planks", owner);
          putBlock(cx + n, ground + y, cz + 3, "planks", owner);
        }

        putBlock(cx - 3, ground + y, cz + n, "planks", owner);
        putBlock(cx + 3, ground + y, cz + n, "planks", owner);
      }
    }

    // Roof
    for (let n = -3; n <= 3; n++) {
      putBlock(cx + n, ground + 5, cz - 3, "roof", owner);
      putBlock(cx + n, ground + 5, cz + 3, "roof", owner);
    }

    for (let n = -2; n <= 2; n++) {
      putBlock(cx - 2, ground + 6, cz + n, "roof", owner);
      putBlock(cx + 2, ground + 6, cz + n, "roof", owner);
    }

    // Chimney and door detail
    putBlock(cx + 2, ground + 6, cz, "stone", owner);
  }

  function generateChunk(cx, cz) {
    const id = `${cx},${cz}`;
    if (chunks.has(id)) return;

    chunks.set(id, new Set());

    const owner = id;
    const startX = cx * chunkSize;
    const startZ = cz * chunkSize;

    for (let lx = 0; lx < chunkSize; lx++) {
      for (let lz = 0; lz < chunkSize; lz++) {
        const x = startX + lx;
        const z = startZ + lz;
        const h = heightAt(x, z);
        const river = isRiver(x, z);

        for (let y = -3; y <= h; y++) {
          let type = y === h ? "grass" :
                     y >= h - 2 ? "dirt" : "stone";

          if (river && y === h) type = "sand";

          // Scatter ores underground
          if (y < h - 2 && hash(x + y * 7, z) > 0.94) {
            const ores = ["coal", "iron", "gold", "diamond"];
            type = ores[Math.floor(hash(x, z + y) * ores.length)];
          }

          putBlock(x, y, z, type, owner);
        }

        // Fill river trough to a common water level
        if (river && h < 3) {
          for (let y = h + 1; y <= 2; y++) {
            putBlock(x, y, z, "water", owner);
          }
        }

        // Village only around spawn
        const inVillage = Math.abs(x) < 15 && Math.abs(z) < 15;

        if (!inVillage && !river &&
            hash(x, z) > 0.987 && h >= 1) {
          tree(x, z, owner);
        }
      }
    }

    // Village houses around the starting area
    if (Math.abs(cx) <= 1 && Math.abs(cz) <= 1) {
      if (cx === -1 && cz === -1) house(-7, -7, owner);
      if (cx ===  0 && cz === -1) house(7, -7, owner);
      if (cx === -1 && cz ===  0) house(-7, 7, owner);
      if (cx ===  0 && cz ===  0) house(7, 7, owner);
    }
  }

  function updateChunks() {
    const pcx = Math.floor(player.x / chunkSize);
    const pcz = Math.floor(player.z / chunkSize);

    for (let x = pcx - renderDistance; x <= pcx + renderDistance; x++) {
      for (let z = pcz - renderDistance; z <= pcz + renderDistance; z++) {
        generateChunk(x, z);
      }
    }

    for (const [id, blocks] of chunks) {
      const [x, z] = id.split(",").map(Number);

      if (Math.abs(x - pcx) > renderDistance + 1 ||
          Math.abs(z - pcz) > renderDistance + 1) {
        for (const mesh of blocks) {
          allBlocks.delete(blockKey(
            mesh.userData.x, mesh.userData.y, mesh.userData.z
          ));
          scene.remove(mesh);
        }
        chunks.delete(id);
      }
    }
  }

  // Starting village and nearby river
  updateChunks();

  const bar = document.getElementById("hotbar");

  function drawHotbar() {
    bar.innerHTML = "";

    hotbar.forEach((type, index) => {
      const button = document.createElement("button");
      button.className = "slot" + (selected === type ? " active" : "");
      button.textContent = `${index + 1} ${type}`;
      button.onclick = () => {
        selected = type;
        drawHotbar();
      };
      bar.appendChild(button);
    });
  }

  drawHotbar();

  document.getElementById("play").onclick = () => {
    playing = true;
    document.getElementById("menu").style.display = "none";
    document.getElementById("hud").style.display = "block";
    renderer.domElement.requestPointerLock();
  };

  document.addEventListener("pointerlockchange", () => {
    if (!playing) return;

    if (document.pointerLockElement !== renderer.domElement) {
      document.getElementById("menu").style.display = "flex";
    } else {
      document.getElementById("menu").style.display = "none";
    }
  });

  document.addEventListener("mousemove", event => {
    if (!playing || document.pointerLockElement !== renderer.domElement) return;

    yaw -= event.movementX * 0.002;
    pitch -= event.movementY * 0.002;
    pitch = Math.max(-1.45, Math.min(1.45, pitch));
  });

  document.addEventListener("keydown", event => {
    keys[event.code] = true;

    if (event.code.startsWith("Digit")) {
      const index = Number(event.code.slice(5)) - 1;
      if (hotbar[index]) {
        selected = hotbar[index];
        drawHotbar();
      }
    }
  });

  document.addEventListener("keyup", event => {
    keys[event.code] = false;
  });

  document.addEventListener("contextmenu", event => event.preventDefault());

  const raycaster = new THREE.Raycaster();

  function getTarget() {
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    raycaster.far = 6;

    const hits = raycaster.intersectObjects(
      Array.from(allBlocks.values()), false
    );

    return hits.length ? hits[0] : null;
  }

  document.addEventListener("mousedown", event => {
    if (!playing || document.pointerLockElement !== renderer.domElement) return;

    const hit = getTarget();
    if (!hit) return;

    const mesh = hit.object;

    if (event.button === 0) {
      if (mesh.userData.type === "water") return;

      inventory[mesh.userData.type] =
        (inventory[mesh.userData.type] || 0) + 1;

      removeBlock(mesh);
      blockCount++;
    }

    if (event.button === 2 && blockCount > 0) {
      const pos = mesh.position.clone().add(hit.face.normal);
      const x = Math.round(pos.x);
      const y = Math.round(pos.y);
      const z = Math.round(pos.z);

      if (y >= 1 && Math.hypot(x - player.x, z - player.z) > 1.2) {
        if (putBlock(x, y, z, selected, null)) blockCount--;
      }
    }

    document.getElementById("stats").textContent =
      `X: ${Math.floor(player.x)} | Z: ${Math.floor(player.z)} | Blocks: ${blockCount}`;

    document.getElementById("target").textContent =
      "Block: " + mesh.userData.type;
  });

  const clock = new THREE.Clock();

  function animate() {
    requestAnimationFrame(animate);

    const dt = Math.min(clock.getDelta(), 0.04);

    if (playing) {
      const speed = 5 * dt;

      const fx = -Math.sin(yaw);
      const fz = -Math.cos(yaw);
      const rx = Math.cos(yaw);
      const rz = -Math.sin(yaw);

      if (keys.KeyW) { player.x += fx * speed; player.z += fz * speed; }
      if (keys.KeyS) { player.x -= fx * speed; player.z -= fz * speed; }
      if (keys.KeyA) { player.x -= rx * speed; player.z -= rz * speed; }
      if (keys.KeyD) { player.x += rx * speed; player.z += rz * speed; }

      if (keys.Space && player.grounded) {
        player.vy = 7;
        player.grounded = false;
      }

      player.vy -= 18 * dt;
      player.y += player.vy * dt;

      if (player.y < 2) {
        player.y = 2;
        player.vy = 0;
        player.grounded = true;
      }

      updateChunks();

      camera.position.set(player.x, player.y + 0.4, player.z);
      camera.rotation.order = "YXZ";
      camera.rotation.set(pitch, yaw, 0);

      const hit = getTarget();
      document.getElementById("target").textContent =
        hit ? "Block: " + hit.object.userData.type : "Block: None";

      document.getElementById("stats").textContent =
        `Endless World | X: ${Math.floor(player.x)} | Z: ${Math.floor(player.z)} | Blocks: ${blockCount}`;
    }

    renderer.render(scene, camera);
  }

  window.addEventListener("resize", () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });

  document.getElementById("loading").style.display = "none";
  document.getElementById("menu").style.display = "flex";

  animate();
})();
