import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

// --- CONFIGURATION & STATE ---
let config = {};
let scene, camera, renderer, composer;
let characterGroup;
let scrollPos = 0;
let targetScrollPos = 0;
// Increased total length to fit Certifications
const totalLength = 350; 
let mouse = new THREE.Vector2();
let windowHalfX = window.innerWidth / 2;
let windowHalfY = window.innerHeight / 2;

// GAME STATE
let isGameActive = false;

// Updated Zones with separate Certifications area
const zones = [
    { id: 'intro', start: 0, end: -25, title: 'INTRO' },
    { id: 'about', start: -25, end: -65, title: 'ABOUT ME' },
    { id: 'experience', start: -65, end: -115, title: 'EXPERIENCE' },
    { id: 'projects', start: -115, end: -175, title: 'PROJECTS' },
    { id: 'skills', start: -175, end: -225, title: 'SKILLS' },
    { id: 'education', start: -225, end: -265, title: 'EDUCATION' },
    { id: 'certifications', start: -265, end: -315, title: 'CERTIFICATIONS' },
    { id: 'contact', start: -315, end: -350, title: 'CONTACT' }
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

// Outline Generator
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
    // Initial Camera Position (Cinematic Angle for Intro)
    camera.position.set(0, 4, 10);

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

    // 4. Post Processing
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
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('mousemove', onMouseMove);

    // Init UI
    initUI();
    document.getElementById('loader').style.opacity = 0;
    setTimeout(() => document.getElementById('loader').style.display = 'none', 500);

    // START THE INTRO SEQUENCE
    playIntro();

    animate();
}

// --- INTRO SEQUENCE ---
function playIntro() {
    const textContainer = document.getElementById('terminal-text');
    const startBtn = document.getElementById('start-btn');
    const lines = config.personal.intro_text || ["System Initializing...", "Welcome."];
    let lineIndex = 0;
    let charIndex = 0;

    function typeLine() {
        if (lineIndex < lines.length) {
            if (charIndex < lines[lineIndex].length) {
                // If starting a new line, add a div
                if (charIndex === 0) {
                    textContainer.innerHTML += `<div></div>`;
                }
                // Append char to last div
                textContainer.lastElementChild.innerHTML += lines[lineIndex].charAt(charIndex);
                charIndex++;
                setTimeout(typeLine, 30);
            } else {
                lineIndex++;
                charIndex = 0;
                setTimeout(typeLine, 300);
            }
        } else {
            // Typing done, show button
            startBtn.classList.remove('hidden');
            startBtn.classList.add('visible');
        }
    }

    typeLine();

    startBtn.addEventListener('click', () => {
        // Hide Overlay
        document.getElementById('intro-overlay').style.display = 'none';
        
        // Show Main UI
        document.getElementById('ui-layer').classList.remove('hidden');
        
        // Enable Game
        isGameActive = true;
        
        // Reset Camera to Gameplay position smoothly in animate loop logic
        // But for instant feel:
        camera.position.set(0, 6, 15);
    });
}


// --- WORLD CREATION ---

function createEnvironment() {
    // Sky
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

    // Ground
    const groundGeo = new THREE.PlaneGeometry(60, 450, 50, 450); 
    groundGeo.rotateX(-Math.PI / 2);
    const posAttribute = groundGeo.attributes.position;
    for (let i = 0; i < posAttribute.count; i++) {
        const x = posAttribute.getX(i);
        const z = posAttribute.getZ(i);
        const pathX = getPathX(z);
        posAttribute.setX(i, x + pathX);
        posAttribute.setY(i, Math.sin(x * 0.2) * 0.5 + Math.cos(z * 0.1) * 0.5);
    }

    // --- COLOR CHANGE HERE ---
    // Changed from 0x1e1e2e (Dark) to 0x4a5568 (Lighter Cool Grey)
    const groundMat = createAnimeMaterial(0x34495e); 
    
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.position.z = -150; 
    addOutline(ground, 0.005, 0x5555ff); 
    scene.add(ground);
}

// *** BATMAN CHARACTER ***
function createCharacter() {
    characterGroup = new THREE.Group();
    const s = 1.5;
    
    const grayMat = createAnimeMaterial(0x34495e);  
    const blackMat = createAnimeMaterial(0x111111); 
    const skinMat = createAnimeMaterial(0xffdcb6);  
    const yellowMat = createAnimeMaterial(0xf1c40f); 

    // Head
    const headGroup = new THREE.Group();
    const headGeo = new THREE.BoxGeometry(0.5*s, 0.4*s, 0.5*s);
    const head = new THREE.Mesh(headGeo, blackMat);
    addOutline(head);
    headGroup.add(head);

    const earGeo = new THREE.ConeGeometry(0.08*s, 0.2*s, 4);
    const earL = new THREE.Mesh(earGeo, blackMat);
    earL.position.set(-0.15*s, 0.25*s, 0);
    earL.rotation.y = Math.PI / 4; 
    addOutline(earL);
    
    const earR = new THREE.Mesh(earGeo, blackMat);
    earR.position.set(0.15*s, 0.25*s, 0);
    earR.rotation.y = Math.PI / 4;
    addOutline(earR);
    headGroup.add(earL, earR);

    const chinGeo = new THREE.BoxGeometry(0.3*s, 0.15*s, 0.05*s);
    const chin = new THREE.Mesh(chinGeo, skinMat);
    chin.position.set(0, -0.12*s, 0.23*s); 
    headGroup.add(chin);
    headGroup.position.y = 1.6 * s;
    characterGroup.add(headGroup);

    // Body
    const bodyGroup = new THREE.Group();
    const torsoGeo = new THREE.BoxGeometry(0.6*s, 0.8*s, 0.4*s);
    const torso = new THREE.Mesh(torsoGeo, grayMat);
    addOutline(torso);
    bodyGroup.add(torso);

    const logoGeo = new THREE.BoxGeometry(0.3*s, 0.15*s, 0.05*s);
    const logo = new THREE.Mesh(logoGeo, yellowMat);
    logo.position.set(0, 0.15*s, 0.2*s); 
    bodyGroup.add(logo);

    const beltGeo = new THREE.BoxGeometry(0.62*s, 0.1*s, 0.42*s);
    const belt = new THREE.Mesh(beltGeo, yellowMat);
    belt.position.y = -0.35 * s; 
    addOutline(belt);
    bodyGroup.add(belt);

    const capeGeo = new THREE.BoxGeometry(0.7*s, 1.2*s, 0.1*s);
    const cape = new THREE.Mesh(capeGeo, blackMat);
    cape.position.set(0, -0.2*s, -0.25*s); 
    cape.rotation.x = 0.1; 
    addOutline(cape);
    bodyGroup.add(cape);
    bodyGroup.position.y = 0.9 * s;
    characterGroup.add(bodyGroup);

    // Limbs
    characterGroup.userData.limbs = [];
    
    const createLimb = (w, h, d, mainMat, accentMat, x, y, z) => {
        const group = new THREE.Group();
        const upperGeo = new THREE.BoxGeometry(w*s, h/2*s, d*s);
        const upper = new THREE.Mesh(upperGeo, mainMat);
        upper.position.y = -h/4*s;
        addOutline(upper);
        group.add(upper);

        const lowerGeo = new THREE.BoxGeometry(w*s, h/2*s, d*s);
        const lower = new THREE.Mesh(lowerGeo, accentMat);
        lower.position.y = -h*0.75*s;
        addOutline(lower);
        group.add(lower);

        group.position.set(x*s, y*s, z*s);
        characterGroup.add(group);
        return group;
    };

    const armL = createLimb(0.2, 0.7, 0.2, grayMat, blackMat, -0.45, 1.2, 0);
    const armR = createLimb(0.2, 0.7, 0.2, grayMat, blackMat, 0.45, 1.2, 0);
    const legL = createLimb(0.25, 0.8, 0.25, grayMat, blackMat, -0.2, 0.5, 0);
    const legR = createLimb(0.25, 0.8, 0.25, grayMat, blackMat, 0.2, 0.5, 0);

    characterGroup.userData.limbs = { armL, armR, legL, legR };
    characterGroup.position.y = 50; 
    scene.add(characterGroup);
}

function populateZones() {
    // 1. INTRO
    const ringGeo = new THREE.TorusGeometry(8, 0.5, 16, 100);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x00ffff });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.set(getPathX(-10), 2, -10);
    scene.add(ring);

    // 2. ABOUT
    for(let z = -30; z > -60; z-=3) {
        const xOff = (Math.random() > 0.5 ? 1 : -1) * (5 + Math.random()*10);
        const x = getPathX(z) + xOff;
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.4, 2), createAnimeMaterial(0x8B4513));
        const leaves = new THREE.Mesh(new THREE.ConeGeometry(2, 4, 8), createAnimeMaterial(0x2ecc71));
        trunk.position.set(x, 1, z);
        leaves.position.set(x, 4, z);
        addOutline(leaves, 0.05);
        scene.add(trunk, leaves);
    }

    // 3. EXPERIENCE
    for(let z = -70; z > -110; z-=5) {
        const h = 10 + Math.random() * 20;
        const geo = new THREE.BoxGeometry(6, h, 6);
        const mat = createAnimeMaterial(0x7f8c8d);
        const b = new THREE.Mesh(geo, mat);
        const xSide = (Math.random() > 0.5 ? 1 : -1) * (12);
        b.position.set(getPathX(z) + xSide, h/2, z);
        addOutline(b, 0.03);
        const winGeo = new THREE.BoxGeometry(6.1, h-2, 6.1);
        const winMat = new THREE.MeshBasicMaterial({color: 0x000000, wireframe:true});
        b.add(new THREE.Mesh(winGeo, winMat));
        scene.add(b);
    }

    // 4. PROJECTS
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

    // 5. SKILLS
    const coreGeo = new THREE.IcosahedronGeometry(6, 1);
    const coreMat = new THREE.MeshBasicMaterial({ color: 0xff00ff, wireframe: true });
    const core = new THREE.Mesh(coreGeo, coreMat);
    core.position.set(getPathX(-200), 8, -200);
    scene.add(core);
    for(let i=0; i<10; i++) {
        const orb = new THREE.Mesh(new THREE.SphereGeometry(1), new THREE.MeshBasicMaterial({color: 0xff00ff}));
        const angle = (i/10)*Math.PI*2;
        orb.position.set(getPathX(-200) + Math.cos(angle)*10, 8, -200 + Math.sin(angle)*10);
        scene.add(orb);
    }

    // 6. EDUCATION
    const monGeo = new THREE.BoxGeometry(4, 15, 4);
    const monMat = createAnimeMaterial(0xf1c40f);
    const mon = new THREE.Mesh(monGeo, monMat);
    mon.position.set(getPathX(-245), 7.5, -245);
    addOutline(mon, 0.03, 0xB8860B);
    scene.add(mon);

    // 7. CERTIFICATIONS (Floating Holo-Panels)
    for(let i=0; i<3; i++) {
        const z = -285 - i*8;
        const panelGeo = new THREE.BoxGeometry(6, 4, 0.2);
        const panelMat = new THREE.MeshBasicMaterial({color: 0x2ecc71, wireframe: true});
        const panel = new THREE.Mesh(panelGeo, panelMat);
        const xSide = (i % 2 === 0 ? 1 : -1) * 8;
        panel.position.set(getPathX(z) + xSide, 4, z);
        // Tilt towards path
        panel.lookAt(getPathX(z), 4, z);
        scene.add(panel);
    }

    // 8. CONTACT
    const portalGeo = new THREE.CircleGeometry(8, 32);
    const portalMat = new THREE.MeshBasicMaterial({ color: 0x0984e3 });
    const portal = new THREE.Mesh(portalGeo, portalMat);
    portal.position.set(getPathX(-340), 8, -340);
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
    if(!isGameActive) return; // Block scroll before start
    targetScrollPos += event.deltaY * 0.05;
    targetScrollPos = Math.max(0, Math.min(targetScrollPos, totalLength));
}

let touchStartY = 0;
function onTouchMove(e) {
    if(!isGameActive) {
        e.preventDefault(); // Prevent default scroll before start
        return; 
    }
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
    if(!isGameActive) return;

    // 1. Progress Bar
    const pct = Math.abs(z) / totalLength;
    document.getElementById('progress-bar').style.setProperty('--prog', `${pct * 100}%`);

    // 2. Identify Zone
    let currentZone = zones[0];
    zones.forEach((zone, index) => {
        if (z <= zone.start && z > zone.end) {
            currentZone = zone;
            const dots = document.querySelectorAll('.dot');
            dots.forEach((d, i) => d.classList.toggle('active', i === index));
        }
    });

    // 3. Update Text
    document.getElementById('zone-indicator').innerText = `ZONE: ${currentZone.title}`;

    // 4. Update Panel Content
    const panel = document.getElementById('content-panel');
    
    if (panel.dataset.zone !== currentZone.id) {
        panel.dataset.zone = currentZone.id;
        
        let html = `<h2>${currentZone.title}</h2>`;
        
        // Config Data Injection
        if (currentZone.id === 'intro') {
            html = ''; 
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
                html += `
                <div class="project-card" style="background:${proj.gradient}">
                    <img src="${proj.image}" class="project-img" alt="${proj.name}">
                    <div class="project-info">
                        <h3>${proj.name}</h3>
                        <p>${proj.description}</p>
                        <div style="margin-top:10px;">
                            ${proj.tags.map(t => `<span class="skill-tag" style="border-color:#555; color:#ddd;">${t}</span>`).join('')}
                        </div>
                    </div>
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
        } else if (currentZone.id === 'certifications') {
             // New separate certification logic
             config.certifications.forEach(cert => {
                 html += `
                 <div class="cert-card">
                    <h4>${cert.name}</h4>
                    <span class="issuer">${cert.issuer}</span>
                    <span class="date">${cert.date}</span>
                    <p>${cert.desc}</p>
                 </div>`;
             });
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

    scrollPos += (targetScrollPos - scrollPos) * 0.05;
    const z = -scrollPos;

    const charX = getPathX(z);
    
    if (scrollPos < 10) {
        // Initial Drop Animation
        characterGroup.position.y = THREE.MathUtils.lerp(characterGroup.position.y, 0, 0.05);
        characterGroup.rotation.y += 0.1; 
    } else {
        characterGroup.position.y = 0;
        characterGroup.position.z = z;
        characterGroup.position.x = charX;
        
        const nextX = getPathX(z - 1);
        const angle = Math.atan2(charX - nextX, 1) + Math.PI; 
        characterGroup.rotation.y = angle;

        if (Math.abs(targetScrollPos - scrollPos) > 0.1) {
            const t = Date.now() * 0.01;
            characterGroup.userData.limbs.legL.rotation.x = Math.sin(t) * 0.6;
            characterGroup.userData.limbs.legR.rotation.x = Math.sin(t + Math.PI) * 0.6;
            characterGroup.userData.limbs.armL.rotation.x = Math.sin(t + Math.PI) * 0.3; 
            characterGroup.userData.limbs.armR.rotation.x = Math.sin(t) * 0.3;
        } else {
            characterGroup.userData.limbs.legL.rotation.x = 0;
            characterGroup.userData.limbs.legR.rotation.x = 0;
            characterGroup.userData.limbs.armL.rotation.x = 0;
            characterGroup.userData.limbs.armR.rotation.x = 0;
        }
    }

    const camTargetZ = z + 15;
    const camTargetX = getPathX(camTargetZ);
    
    camera.position.z += (camTargetZ - camera.position.z) * 0.05;
    camera.position.x += (camTargetX - camera.position.x) * 0.05;
    camera.lookAt(charX + mouse.x * 5, 2 + mouse.y * 5, z - 10);

    updateUI(z);
    composer.render();
}

// Start
init();
