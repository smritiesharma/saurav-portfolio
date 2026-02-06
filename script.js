import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

// --- CONFIGURATION & STATE ---
let config = {};
let scene, camera, renderer, composer;
let character, mixer, characterGroup;
let scrollPos = 0;
let targetScrollPos = 0;
const totalLength = 300;
let mouse = new THREE.Vector2();
let windowHalfX = window.innerWidth / 2;
let windowHalfY = window.innerHeight / 2;

const zones = [
    { id: 'intro', start: 0, end: -25, title: 'INTRO' },
    { id: 'about', start: -25, end: -65, title: 'ABOUT ME' },
    { id: 'experience', start: -65, end: -115, title: 'EXPERIENCE' },
    { id: 'projects', start: -115, end: -175, title: 'PROJECTS' },
    { id: 'skills', start: -175, end: -225, title: 'SKILLS' },
    { id: 'education', start: -225, end: -265, title: 'EDUCATION' },
    { id: 'contact', start: -265, end: -300, title: 'CONTACT' }
];

// --- MATH & UTILS ---
const getPathX = (z) => Math.sin(z * 0.05) * 12 + Math.sin(z * 0.02) * 5;

// Anime Toon Material Generator
function createAnimeMaterial(color) {
    const format = THREE.RGBFormat;
    const colors = new Uint8Array([60, 60, 60, 128, 128, 128, 230, 230, 230]);
    const gradientMap = new THREE.DataTexture(colors, 3, 1, format);
    gradientMap.needsUpdate = true;
    gradientMap.minFilter = THREE.NearestFilter;
    gradientMap.magFilter = THREE.NearestFilter;

    return new THREE.MeshToonMaterial({
        color: color,
        gradientMap: gradientMap
    });
}

// Outline Generator (Inverted Hull)
function addOutline(mesh, thickness = 0.02, color = 0x000000) {
    const outlineMaterial = new THREE.MeshBasicMaterial({
        color: color,
        side: THREE.BackSide
    });
    const outlineMesh = new THREE.Mesh(mesh.geometry, outlineMaterial);
    outlineMesh.scale.multiplyScalar(1 + thickness);
    mesh.add(outlineMesh);
    return outlineMesh;
}

// --- INITIALIZATION ---
async function init() {
    // Load Config
    try {
        const response = await fetch('config.json');
        config = await response.json();
    } catch (e) {
        console.error("Failed to load config", e);
    }

    // 1. Scene Setup
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0f0c29);
    scene.fog = new THREE.FogExp2(0x1a1a2e, 0.008);

    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 6, 15);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    document.getElementById('canvas-container').appendChild(renderer.domElement);

    // 2. Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(50, 100, 50);
    scene.add(dirLight);

    // 3. World Generation
    createEnvironment();
    createCharacter();
    populateZones();
    createParticles();

    // 4. Post Processing (Bloom)
    const renderScene = new RenderPass(scene, camera);
    const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.4, 0.85);
    bloomPass.threshold = 0.2;
    bloomPass.strength = 1.2;
    bloomPass.radius = 0.5;

    composer = new EffectComposer(renderer);
    composer.addPass(renderScene);
    composer.addPass(bloomPass);

    // 5. Events
    window.addEventListener('resize', onWindowResize);
    window.addEventListener('wheel', onScroll);
    window.addEventListener('touchmove', onTouchMove); // Basic touch support
    document.addEventListener('mousemove', onMouseMove);

    // Init UI
    initUI();
    document.getElementById('loader').style.opacity = 0;
    setTimeout(() => document.getElementById('loader').style.display = 'none', 500);

    animate();
}

// --- WORLD CREATION ---

function createEnvironment() {
    // Sky gradient
    const vertexShader = `
        varying vec3 vWorldPosition;
        void main() {
            vec4 worldPosition = modelMatrix * vec4( position, 1.0 );
            vWorldPosition = worldPosition.xyz;
            gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
        }`;
    const fragmentShader = `
        uniform vec3 topColor;
        uniform vec3 bottomColor;
        uniform float offset;
        uniform float exponent;
        varying vec3 vWorldPosition;
        void main() {
            float h = normalize( vWorldPosition + offset ).y;
            gl_FragColor = vec4( mix( bottomColor, topColor, max( pow( max( h , 0.0), exponent ), 0.0 ) ), 1.0 );
        }`;
    const uniforms = {
        topColor: { value: new THREE.Color(0x302b63) },
        bottomColor: { value: new THREE.Color(0x24243e) },
        offset: { value: 33 },
        exponent: { value: 0.6 }
    };
    const skyGeo = new THREE.SphereGeometry(400, 32, 15);
    const skyMat = new THREE.ShaderMaterial({ vertexShader, fragmentShader, uniforms, side: THREE.BackSide });
    const sky = new THREE.Mesh(skyGeo, skyMat);
    scene.add(sky);

    // Deformed Ground Plane
    const groundGeo = new THREE.PlaneGeometry(60, 400, 50, 400);
    groundGeo.rotateX(-Math.PI / 2);
    const posAttribute = groundGeo.attributes.position;
    for (let i = 0; i < posAttribute.count; i++) {
        const x = posAttribute.getX(i);
        const z = posAttribute.getZ(i);
        // Shift x based on path
        const pathX = getPathX(z);
        posAttribute.setX(i, x + pathX);
        
        // Add minimal noise
        posAttribute.setY(i, Math.sin(x * 0.2) * 0.5 + Math.cos(z * 0.1) * 0.5);
    }
    const groundMat = createAnimeMaterial(0x1e1e2e);
    // Grid helper texture logic implied by mesh structure
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.position.z = -150; // Center it somewhat
    addOutline(ground, 0.005, 0x5555ff); // Glowing grid-like outline
    scene.add(ground);
}

function createCharacter() {
    characterGroup = new THREE.Group();
    
    // Scale 1.5x as requested
    const s = 1.5;
    
    // Materials
    const suitMat = createAnimeMaterial(0xff7675); // Coral
    const skinMat = createAnimeMaterial(0xffdcb6);
    const pantMat = createAnimeMaterial(0x2d3436);
    const bagMat = createAnimeMaterial(0xfdcb6e); // Yellow

    // Head
    const headGeo = new THREE.BoxGeometry(0.5*s, 0.5*s, 0.5*s);
    const head = new THREE.Mesh(headGeo, skinMat);
    head.position.y = 1.6 * s;
    addOutline(head);
    characterGroup.add(head);

    // Body
    const bodyGeo = new THREE.BoxGeometry(0.6*s, 0.8*s, 0.4*s);
    const body = new THREE.Mesh(bodyGeo, suitMat);
    body.position.y = 0.9 * s;
    addOutline(body);
    characterGroup.add(body);

    // Backpack
    const bagGeo = new THREE.BoxGeometry(0.4*s, 0.5*s, 0.3*s);
    const bag = new THREE.Mesh(bagGeo, bagMat);
    bag.position.set(0, 1.0 * s, 0.25 * s);
    addOutline(bag);
    characterGroup.add(bag);

    // Limbs (Simple boxes for now, animated in render loop)
    characterGroup.userData.limbs = [];
    
    // Function to create limb
    const createLimb = (w, h, d, mat, x, y, z) => {
        const g = new THREE.BoxGeometry(w*s, h*s, d*s);
        g.translate(0, -h*s/2, 0); // Pivot at top
        const m = new THREE.Mesh(g, mat);
        m.position.set(x*s, y*s, z*s);
        addOutline(m);
        characterGroup.add(m);
        return m;
    };

    const armL = createLimb(0.2, 0.7, 0.2, suitMat, -0.45, 1.2, 0);
    const armR = createLimb(0.2, 0.7, 0.2, suitMat, 0.45, 1.2, 0);
    const legL = createLimb(0.25, 0.8, 0.25, pantMat, -0.2, 0.5, 0);
    const legR = createLimb(0.25, 0.8, 0.25, pantMat, 0.2, 0.5, 0);

    characterGroup.userData.limbs = { armL, armR, legL, legR };
    
    // Initial Spawn Animation setup
    characterGroup.position.y = 50; 
    
    scene.add(characterGroup);
}

function populateZones() {
    // 1. INTRO: Cyan Ring
    const ringGeo = new THREE.TorusGeometry(8, 0.5, 16, 100);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x00ffff });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.set(getPathX(-10), 2, -10);
    scene.add(ring);

    // 2. ABOUT: Trees & Orbs (-25 to -65)
    for(let z = -30; z > -60; z-=3) {
        const xOff = (Math.random() > 0.5 ? 1 : -1) * (5 + Math.random()*10);
        const x = getPathX(z) + xOff;
        
        // Tree (Cone + Cylinder)
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.4, 2), createAnimeMaterial(0x8B4513));
        const leaves = new THREE.Mesh(new THREE.ConeGeometry(2, 4, 8), createAnimeMaterial(0x2ecc71));
        trunk.position.set(x, 1, z);
        leaves.position.set(x, 4, z);
        addOutline(leaves, 0.05);
        scene.add(trunk, leaves);
    }

    // 3. EXPERIENCE: Skyscrapers (-65 to -115)
    for(let z = -70; z > -110; z-=5) {
        const h = 10 + Math.random() * 20;
        const geo = new THREE.BoxGeometry(6, h, 6);
        const mat = createAnimeMaterial(0x7f8c8d);
        const b = new THREE.Mesh(geo, mat);
        const xSide = (Math.random() > 0.5 ? 1 : -1) * (12);
        b.position.set(getPathX(z) + xSide, h/2, z);
        addOutline(b, 0.03);
        
        // Windows
        const winGeo = new THREE.BoxGeometry(6.1, h-2, 6.1);
        const winMat = new THREE.MeshBasicMaterial({color: 0x000000, wireframe:true});
        b.add(new THREE.Mesh(winGeo, winMat));
        
        scene.add(b);
    }

    // 4. PROJECTS: Tech Pillars (-115 to -175)
    const floorGeo = new THREE.PlaneGeometry(20, 60);
    const floorMat = new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.2, side: THREE.DoubleSide });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI/2;
    floor.position.set(getPathX(-145), 0.1, -145);
    scene.add(floor);

    for(let i=0; i<6; i++) {
        const z = -125 - i*8;
        const pGeo = new THREE.CylinderGeometry(1, 1, 10, 6);
        const pMat = createAnimeMaterial(0x3498db);
        const p = new THREE.Mesh(pGeo, pMat);
        p.position.set(getPathX(z) + (i%2==0?8:-8), 5, z);
        addOutline(p, 0.02, 0x00ffff);
        scene.add(p);
    }

    // 5. SKILLS: Magenta Core (-175 to -225)
    const coreGeo = new THREE.IcosahedronGeometry(6, 1);
    const coreMat = new THREE.MeshBasicMaterial({ color: 0xff00ff, wireframe: true });
    const core = new THREE.Mesh(coreGeo, coreMat);
    core.position.set(getPathX(-200), 8, -200);
    scene.add(core);
    
    // Orbiting orbs logic handled in animate if dynamic, static for now
    for(let i=0; i<10; i++) {
        const orb = new THREE.Mesh(new THREE.SphereGeometry(1), new THREE.MeshBasicMaterial({color: 0xff00ff}));
        const angle = (i/10)*Math.PI*2;
        orb.position.set(getPathX(-200) + Math.cos(angle)*10, 8, -200 + Math.sin(angle)*10);
        scene.add(orb);
    }

    // 6. EDUCATION: Gold Monument (-225 to -265)
    const monGeo = new THREE.BoxGeometry(4, 15, 4);
    const monMat = createAnimeMaterial(0xf1c40f);
    const mon = new THREE.Mesh(monGeo, monMat);
    mon.position.set(getPathX(-245), 7.5, -245);
    addOutline(mon, 0.03, 0xB8860B);
    scene.add(mon);

    // 7. CONTACT: Portal
    const portalGeo = new THREE.CircleGeometry(8, 32);
    const portalMat = new THREE.MeshBasicMaterial({ color: 0x0984e3 });
    const portal = new THREE.Mesh(portalGeo, portalMat);
    portal.position.set(getPathX(-290), 8, -290);
    scene.add(portal);
}

function createParticles() {
    const geometry = new THREE.BufferGeometry();
    const vertices = [];
    for (let i = 0; i < 2000; i++) {
        vertices.push(
            THREE.MathUtils.randFloatSpread(400),
            THREE.MathUtils.randFloatSpread(200),
            THREE.MathUtils.randFloatSpread(600) - 300
        );
    }
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    const particles = new THREE.Points(geometry, new THREE.PointsMaterial({ color: 0xffffff, size: 0.5 }));
    scene.add(particles);
}

// --- INTERACTION ---

function onScroll(event) {
    targetScrollPos += event.deltaY * 0.05;
    targetScrollPos = Math.max(0, Math.min(targetScrollPos, totalLength));
}

let touchStartY = 0;
function onTouchMove(e) {
    const y = e.touches[0].clientY;
    const diff = touchStartY - y;
    targetScrollPos += diff * 0.1;
    targetScrollPos = Math.max(0, Math.min(targetScrollPos, totalLength));
    touchStartY = y;
}

function onMouseMove(event) {
    mouse.x = (event.clientX - windowHalfX) * 0.001;
    mouse.y = (event.clientY - windowHalfY) * 0.001;
}

function onWindowResize() {
    windowHalfX = window.innerWidth / 2;
    windowHalfY = window.innerHeight / 2;
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
}

// --- UI LOGIC ---

function initUI() {
    const container = document.getElementById('dots-container');
    zones.forEach((zone, index) => {
        const dot = document.createElement('div');
        dot.className = 'dot';
        dot.dataset.id = index;
        container.appendChild(dot);
    });
}

function updateUI(z) {
    // 1. Progress Bar
    const pct = Math.abs(z) / totalLength;
    document.getElementById('progress-bar').style.setProperty('--prog', `${pct * 100}%`);

    // 2. Identify Zone
    let currentZone = zones[0];
    zones.forEach((zone, index) => {
        if (z <= zone.start && z > zone.end) {
            currentZone = zone;
            // Update dots
            const dots = document.querySelectorAll('.dot');
            dots.forEach((d, i) => d.classList.toggle('active', i === index));
        }
    });

    // 3. Update Text
    document.getElementById('zone-indicator').innerText = `ZONE: ${currentZone.title}`;

    // 4. Update Panel Content
    const panel = document.getElementById('content-panel');
    // Only update if content changed/active
    if (panel.dataset.zone !== currentZone.id) {
        panel.dataset.zone = currentZone.id;
        
        let html = `<h2>${currentZone.title}</h2>`;
        
        // Config Data Injection
        if (currentZone.id === 'intro') {
            html = ''; // No panel for intro
        } else if (currentZone.id === 'about') {
            html += `<p>${config.personal.bio.join('<br><br>')}</p>`;
            html += `<div style="margin-top:20px; display:flex; justify-content:space-around;">`;
            config.personal.stats.forEach(s => {
                html += `<div style="text-align:center;"><div style="font-size:1.5rem; color:#ff7675;">${s.value}</div><div style="font-size:0.8rem;">${s.label}</div></div>`;
            });
            html += `</div>`;
        } else if (currentZone.id === 'experience') {
            config.experience.forEach(exp => {
                html += `<div class="panel-item"><h3>${exp.title}</h3><span class="meta">${exp.company} | ${exp.period}</span><p>${exp.description}</p></div>`;
            });
        } else if (currentZone.id === 'projects') {
            config.projects.forEach(proj => {
                html += `<div class="project-card" style="background:${proj.gradient}; color:#333;">
                    <div style="font-size:1.5rem;">${proj.emoji}</div>
                    <h3>${proj.name}</h3>
                    <p style="color:#444;">${proj.description}</p>
                    <div style="margin-top:5px;">${proj.tags.map(t => `<span style="background:rgba(0,0,0,0.1); padding:2px 5px; border-radius:3px; font-size:0.7rem; margin-right:5px;">${t}</span>`).join('')}</div>
                </div>`;
            });
        } else if (currentZone.id === 'skills') {
            config.skills.forEach(cat => {
                html += `<div class="panel-item"><h3>${cat.category}</h3>`;
                cat.items.forEach(skill => {
                    html += `<span class="skill-tag">${skill.name}</span>`;
                });
                html += `</div>`;
            });
        } else if (currentZone.id === 'education') {
             config.education.forEach(edu => {
                 html += `<div class="panel-item"><h3>${edu.icon} ${edu.degree}</h3><span class="meta">${edu.institution} | ${edu.period}</span><p>${edu.description}</p></div>`;
             });
             html += `<h3>Certifications</h3><ul>`;
             config.certifications.forEach(cert => html += `<li style="margin-left:20px; color:#ddd; margin-bottom:5px;">${cert}</li>`);
             html += `</ul>`;
        } else if (currentZone.id === 'contact') {
            html += `<p>${config.contact.message}</p><br>`;
            config.contact.links.forEach(link => {
                html += `<a href="${link.url}" target="_blank" class="contact-link"><span class="contact-icon">${link.icon}</span><span>${link.text}</span></a>`;
            });
        }

        if(html === '') {
            panel.classList.add('hidden');
        } else {
            panel.innerHTML = `<div class="panel-content">${html}</div>`;
            panel.classList.remove('hidden');
        }
    }
}

// --- ANIMATION LOOP ---

function animate() {
    requestAnimationFrame(animate);

    // 1. Scroll Interpolation
    scrollPos += (targetScrollPos - scrollPos) * 0.05;
    const z = -scrollPos;

    // 2. Character Position
    const charX = getPathX(z);
    
    // Spawn drop animation
    if (scrollPos < 10) {
        characterGroup.position.y = THREE.MathUtils.lerp(characterGroup.position.y, 0, 0.05);
        characterGroup.rotation.y += 0.1; // Spin
    } else {
        characterGroup.position.y = 0;
        characterGroup.position.z = z;
        characterGroup.position.x = charX;
        
        // Rotation: Look ahead
        const nextX = getPathX(z - 1);
        const angle = Math.atan2(charX - nextX, 1); // 1 is delta Z
        characterGroup.rotation.y = angle;

        // Walk Cycle
        if (Math.abs(targetScrollPos - scrollPos) > 0.1) {
            const t = Date.now() * 0.01;
            characterGroup.userData.limbs.legL.rotation.x = Math.sin(t) * 0.5;
            characterGroup.userData.limbs.legR.rotation.x = Math.sin(t + Math.PI) * 0.5;
            characterGroup.userData.limbs.armL.rotation.x = Math.sin(t + Math.PI) * 0.5;
            characterGroup.userData.limbs.armR.rotation.x = Math.sin(t) * 0.5;
        } else {
            // Reset limbs
            characterGroup.userData.limbs.legL.rotation.x = 0;
            characterGroup.userData.limbs.legR.rotation.x = 0;
            characterGroup.userData.limbs.armL.rotation.x = 0;
            characterGroup.userData.limbs.armR.rotation.x = 0;
        }
    }

    // 3. Camera Follow
    const camTargetZ = z + 15;
    const camTargetX = getPathX(camTargetZ);
    
    camera.position.z += (camTargetZ - camera.position.z) * 0.05;
    camera.position.x += (camTargetX - camera.position.x) * 0.05;
    camera.lookAt(charX + mouse.x * 5, 2 + mouse.y * 5, z - 10);

    // 4. Update UI
    updateUI(z);

    // 5. Render
    composer.render();
}

// Start
init();