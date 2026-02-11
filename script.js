import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

// --- CONFIGURATION & STATE ---
let config = {};
let scene, camera, renderer, composer;
let characterGroup, portalMesh, groundMesh; 
let scrollPos = 0;
let targetScrollPos = 0;
let raycaster, rayOrigin, rayDir; 

// FIX 2: SHORTENED JOURNEY
// Reduced total length to remove empty walking space.
// Journey now ends at 390 (previously 430)
const totalLength = 390; 

let mouse = new THREE.Vector2();
let windowHalfX = window.innerWidth / 2;
let windowHalfY = window.innerHeight / 2;
let isGameActive = false;
let speechBubble;

// ZONES
const zones = [
    { id: 'intro', start: 0, end: -25, title: 'INTRO' },
    { id: 'about', start: -25, end: -65, title: 'ABOUT ME' },
    { id: 'experience', start: -65, end: -115, title: 'EXPERIENCE' },
    { id: 'projects', start: -115, end: -175, title: 'PROJECTS' },
    { id: 'skills', start: -175, end: -225, title: 'SKILLS' },
    { id: 'education', start: -225, end: -265, title: 'EDUCATION' },
    { id: 'certifications', start: -265, end: -365, title: 'CERTIFICATIONS' },
    // FIX 2: Contact appears immediately after Certs ends (-365) -> Portal (-380)
    { id: 'contact', start: -380, end: -500, title: 'CONTACT' } 
];

// --- MATH & UTILS ---
const getPathX = (z) => Math.sin(z * 0.05) * 12 + Math.sin(z * 0.02) * 5;

function createAnimeMaterial(color) {
    const format = THREE.RGBAFormat;
    const colors = new Uint8Array([
        60, 60, 60, 255,
        128, 128, 128, 255,
        230, 230, 230, 255
    ]);
    const gradientMap = new THREE.DataTexture(colors, 3, 1, format);
    gradientMap.needsUpdate = true;
    gradientMap.minFilter = THREE.NearestFilter;
    gradientMap.magFilter = THREE.NearestFilter;
    return new THREE.MeshToonMaterial({ color: color, gradientMap: gradientMap });
}

function addOutline(mesh, thickness = 0.02, color = 0x000000) {
    const outlineMaterial = new THREE.MeshBasicMaterial({ color: color, side: THREE.BackSide });
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
    } catch (e) { console.error("Failed to load config", e); }

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0f0c29);
    scene.fog = new THREE.FogExp2(0x1a1a2e, 0.008);

    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 2000); 
    camera.position.set(0, 4, 10);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    document.getElementById('canvas-container').appendChild(renderer.domElement);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(50, 100, 50);
    scene.add(dirLight);

    raycaster = new THREE.Raycaster();
    rayOrigin = new THREE.Vector3(0, 50, 0); 
    rayDir = new THREE.Vector3(0, -1, 0);   

    createEnvironment();
    createCharacter();
    populateZones();
    createParticles();

    const renderScene = new RenderPass(scene, camera);
    const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.4, 0.85);
    bloomPass.threshold = 0.2;
    bloomPass.strength = 1.2;
    bloomPass.radius = 0.5;

    composer = new EffectComposer(renderer);
    composer.addPass(renderScene);
    composer.addPass(bloomPass);

    window.addEventListener('resize', onWindowResize);
    window.addEventListener('wheel', onScroll);
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('mousemove', onMouseMove);

    initUI();
    document.getElementById('loader').style.opacity = 0;
    setTimeout(() => document.getElementById('loader').style.display = 'none', 500);

    playIntro();
    animate();
}

// --- INTRO ---
function playIntro() {
    const textContainer = document.getElementById('terminal-text');
    const startBtn = document.getElementById('start-btn');
    const lines = config.personal?.intro_text || ["SYSTEM READY"];
    let lineIndex = 0;
    let charIndex = 0;

    function typeLine() {
        if (lineIndex < lines.length) {
            if (charIndex < lines[lineIndex].length) {
                if (charIndex === 0) textContainer.innerHTML += `<div></div>`;
                textContainer.lastElementChild.innerHTML += lines[lineIndex].charAt(charIndex);
                charIndex++;
                setTimeout(typeLine, 30);
            } else {
                lineIndex++;
                charIndex = 0;
                setTimeout(typeLine, 300);
            }
        } else {
            startBtn.classList.remove('hidden');
            startBtn.classList.add('visible');
        }
    }
    typeLine();

    startBtn.addEventListener('click', () => {
        document.getElementById('intro-overlay').style.display = 'none';
        document.getElementById('ui-layer').classList.remove('hidden');
        isGameActive = true;
        camera.position.set(0, 6, 15);
    });
}

// --- WORLD ---
function createEnvironment() {
    const skyGeo = new THREE.SphereGeometry(400, 32, 15);
    const skyMat = new THREE.MeshBasicMaterial({ color: 0x0f0c29, side: THREE.BackSide }); 
    const sky = new THREE.Mesh(skyGeo, skyMat);
    scene.add(sky);

    const groundGeo = new THREE.PlaneGeometry(60, 2000, 50, 2000); 
    groundGeo.rotateX(-Math.PI / 2);
    const posAttribute = groundGeo.attributes.position;
    for (let i = 0; i < posAttribute.count; i++) {
        const x = posAttribute.getX(i);
        const z = posAttribute.getZ(i);
        const pathX = getPathX(z);
        posAttribute.setX(i, x + pathX);
        posAttribute.setY(i, Math.sin(x * 0.2) * 0.5 + Math.cos(z * 0.1) * 0.5);
    }
    const groundMat = createAnimeMaterial(0x636e72); 
    groundMesh = new THREE.Mesh(groundGeo, groundMat); 
    groundMesh.position.z = -500; 
    addOutline(groundMesh, 0.005, 0x5555ff); 
    scene.add(groundMesh);
}

function createCharacter() {
    characterGroup = new THREE.Group();
    const s = 1.5;
    const grayMat = createAnimeMaterial(0x34495e);  
    const blackMat = createAnimeMaterial(0x111111); 
    const skinMat = createAnimeMaterial(0xffdcb6);  
    const yellowMat = createAnimeMaterial(0xf1c40f); 

    const headGroup = new THREE.Group();
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.5*s, 0.4*s, 0.5*s), blackMat);
    addOutline(head); headGroup.add(head);
    const earL = new THREE.Mesh(new THREE.ConeGeometry(0.08*s, 0.2*s, 4), blackMat);
    earL.position.set(-0.15*s, 0.25*s, 0); earL.rotation.y = Math.PI/4; addOutline(earL);
    const earR = new THREE.Mesh(new THREE.ConeGeometry(0.08*s, 0.2*s, 4), blackMat);
    earR.position.set(0.15*s, 0.25*s, 0); earR.rotation.y = Math.PI/4; addOutline(earR);
    headGroup.add(earL, earR);
    const chin = new THREE.Mesh(new THREE.BoxGeometry(0.3*s, 0.15*s, 0.05*s), skinMat);
    chin.position.set(0, -0.12*s, 0.23*s); headGroup.add(chin);
    headGroup.position.y = 1.6*s; characterGroup.add(headGroup);

    const bodyGroup = new THREE.Group();
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.6*s, 0.8*s, 0.4*s), grayMat);
    addOutline(torso); bodyGroup.add(torso);
    const logo = new THREE.Mesh(new THREE.BoxGeometry(0.3*s, 0.15*s, 0.05*s), yellowMat);
    logo.position.set(0, 0.15*s, 0.2*s); bodyGroup.add(logo);
    const belt = new THREE.Mesh(new THREE.BoxGeometry(0.62*s, 0.1*s, 0.42*s), yellowMat);
    belt.position.y = -0.35*s; addOutline(belt); bodyGroup.add(belt);
    const cape = new THREE.Mesh(new THREE.BoxGeometry(0.7*s, 1.2*s, 0.1*s), blackMat);
    cape.position.set(0, -0.2*s, -0.25*s); cape.rotation.x = 0.1; addOutline(cape); bodyGroup.add(cape);
    bodyGroup.position.y = 0.9*s; characterGroup.add(bodyGroup);

    characterGroup.userData.limbs = [];
    const createLimb = (w, h, d, mainMat, accentMat, x, y, z) => {
        const group = new THREE.Group();
        const upper = new THREE.Mesh(new THREE.BoxGeometry(w*s, h/2*s, d*s), mainMat);
        upper.position.y = -h/4*s; addOutline(upper); group.add(upper);
        const lower = new THREE.Mesh(new THREE.BoxGeometry(w*s, h/2*s, d*s), accentMat);
        lower.position.y = -h*0.75*s; addOutline(lower); group.add(lower);
        group.position.set(x*s, y*s, z*s); characterGroup.add(group);
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
    const ring = new THREE.Mesh(new THREE.TorusGeometry(8, 0.5, 16, 100), new THREE.MeshBasicMaterial({ color: 0x00ffff }));
    ring.position.set(getPathX(-10), 2, -10); scene.add(ring);

    for(let z = -30; z > -60; z-=3) {
        const x = getPathX(z) + (Math.random()>0.5?1:-1)*(5+Math.random()*10);
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.4, 2), createAnimeMaterial(0x8B4513));
        const leaves = new THREE.Mesh(new THREE.ConeGeometry(2, 4, 8), createAnimeMaterial(0x2ecc71));
        trunk.position.set(x, 1, z); leaves.position.set(x, 4, z); addOutline(leaves, 0.05); scene.add(trunk, leaves);
    }

    for(let z = -70; z > -110; z-=5) {
        const h = 10 + Math.random() * 20;
        const b = new THREE.Mesh(new THREE.BoxGeometry(6, h, 6), createAnimeMaterial(0x7f8c8d));
        b.position.set(getPathX(z) + (Math.random()>0.5?1:-1)*12, h/2, z); addOutline(b, 0.03);
        b.add(new THREE.Mesh(new THREE.BoxGeometry(6.1, h-2, 6.1), new THREE.MeshBasicMaterial({color: 0x000000, wireframe:true})));
        scene.add(b);
    }

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 60), new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.2, side: THREE.DoubleSide }));
    floor.rotation.x = -Math.PI/2; floor.position.set(getPathX(-145), 0.1, -145); scene.add(floor);
    for(let i=0; i<6; i++) {
        const z = -125 - i*8;
        const p = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 10, 6), createAnimeMaterial(0x3498db));
        p.position.set(getPathX(z) + (i%2==0?8:-8), 5, z); addOutline(p, 0.02, 0x00ffff); scene.add(p);
    }

    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(6, 1), new THREE.MeshBasicMaterial({ color: 0xff00ff, wireframe: true }));
    core.position.set(getPathX(-200), 8, -200); scene.add(core);
    for(let i=0; i<10; i++) {
        const orb = new THREE.Mesh(new THREE.SphereGeometry(1), new THREE.MeshBasicMaterial({color: 0xff00ff}));
        const angle = (i/10)*Math.PI*2;
        orb.position.set(getPathX(-200) + Math.cos(angle)*10, 8, -200 + Math.sin(angle)*10);
        scene.add(orb);
    }

    const mon = new THREE.Mesh(new THREE.BoxGeometry(4, 15, 4), createAnimeMaterial(0xf1c40f));
    mon.position.set(getPathX(-245), 7.5, -245); addOutline(mon, 0.03, 0xB8860B); scene.add(mon);

    for(let i=0; i<9; i++) {
        const z = -275 - i*10; 
        const panelGeo = new THREE.BoxGeometry(6, 4, 0.2);
        const panelMat = new THREE.MeshBasicMaterial({color: 0x2ecc71, wireframe: true});
        const panel = new THREE.Mesh(panelGeo, panelMat);
        const xSide = (i % 2 === 0 ? 1 : -1) * 8;
        panel.position.set(getPathX(z) + xSide, 4, z);
        panel.lookAt(getPathX(z), 4, z);
        scene.add(panel);
        const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 4), new THREE.MeshBasicMaterial({color: 0x2ecc71}));
        beam.position.set(getPathX(z) + xSide, 2, z);
        scene.add(beam);
    }

    // FIX 2: PORTAL POSITION (-385)
    // Moved significantly closer to close the gap after Certifications (-365)
    portalMesh = new THREE.Mesh(new THREE.CircleGeometry(8, 32), new THREE.MeshBasicMaterial({ color: 0x0984e3, side: THREE.DoubleSide }));
    portalMesh.position.set(getPathX(-385), 8, -385); 
    scene.add(portalMesh);
}

function createParticles() {
    const geometry = new THREE.BufferGeometry();
    const vertices = [];
    for (let i = 0; i < 2000; i++) {
        vertices.push(THREE.MathUtils.randFloatSpread(400), THREE.MathUtils.randFloatSpread(200), THREE.MathUtils.randFloatSpread(600) - 300);
    }
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    scene.add(new THREE.Points(geometry, new THREE.PointsMaterial({ color: 0xffffff, size: 0.5 })));
}

// --- INTERACTION ---
function onScroll(event) {
    if(!isGameActive) return;
    if (targetScrollPos >= totalLength && event.deltaY > 0) {
        targetScrollPos = totalLength; 
        return;
    }
    targetScrollPos += event.deltaY * 0.05;
    targetScrollPos = Math.max(0, Math.min(targetScrollPos, totalLength));
}

let touchStartY = 0;
function onTouchMove(e) {
    if(!isGameActive) { e.preventDefault(); return; }
    const y = e.touches[0].clientY;
    const diff = touchStartY - y;
    if (targetScrollPos >= totalLength && diff > 0) {
        targetScrollPos = totalLength;
        touchStartY = y;
        return;
    }
    targetScrollPos += diff * 0.1;
    targetScrollPos = Math.max(0, Math.min(targetScrollPos, totalLength));
    touchStartY = y;
}

function onMouseMove(event) { mouse.x = (event.clientX - windowHalfX) * 0.001; mouse.y = (event.clientY - windowHalfY) * 0.001; }
function onWindowResize() {
    windowHalfX = window.innerWidth/2; windowHalfY = window.innerHeight/2;
    camera.aspect = window.innerWidth/window.innerHeight; camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight); composer.setSize(window.innerWidth, window.innerHeight);
}

function initUI() {
    const container = document.getElementById('dots-container');
    zones.forEach((zone, index) => {
        const dot = document.createElement('div'); dot.className = 'dot'; dot.dataset.id = index; container.appendChild(dot);
    });

    speechBubble = document.createElement('div');
    Object.assign(speechBubble.style, {
        position: 'absolute',
        top: '20%',
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'white',
        color: 'black',
        padding: '10px 20px',
        borderRadius: '15px',
        fontFamily: "'Space Grotesk', sans-serif",
        fontWeight: 'bold',
        fontSize: '1rem',
        opacity: '0',
        transition: 'opacity 0.3s',
        pointerEvents: 'none',
        zIndex: '100',
        textAlign: 'center'
    });
    speechBubble.innerHTML = "End of Archives.<br>Mission Complete.";
    
    const arrow = document.createElement('div');
    Object.assign(arrow.style, {
        position: 'absolute',
        bottom: '-8px',
        left: '50%',
        marginLeft: '-8px',
        width: '0', height: '0', 
        borderLeft: '8px solid transparent',
        borderRight: '8px solid transparent',
        borderTop: '8px solid white'
    });
    speechBubble.appendChild(arrow);
    document.body.appendChild(speechBubble);
}

function updateUI(z) {
    if(!isGameActive) return;
    const pct = Math.abs(z) / totalLength;
    document.getElementById('progress-bar').style.setProperty('--prog', `${pct * 100}%`);

    let currentZone = zones[0];
    zones.forEach((zone, index) => {
        if (z <= zone.start && z > zone.end) {
            currentZone = zone;
            document.querySelectorAll('.dot').forEach((d, i) => d.classList.toggle('active', i === index));
        }
    });

    document.getElementById('zone-indicator').innerText = `ZONE: ${currentZone.title}`;
    const panel = document.getElementById('content-panel');
    
    if (panel.dataset.zone !== currentZone.id) {
        panel.dataset.zone = currentZone.id;
        let html = `<h2>${currentZone.title}</h2>`;
        
        if (currentZone.id === 'intro') html = ''; 
        else if (currentZone.id === 'about') {
            html += `<p>${config.personal.bio.join('<br><br>')}</p>`;
            html += `<div style="margin-top:20px; display:flex; justify-content:space-around;">`;
            config.personal.stats.forEach(s => html += `<div style="text-align:center;"><div style="font-size:1.5rem; color:#ff7675;">${s.value}</div><div style="font-size:0.8rem;">${s.label}</div></div>`);
            html += `</div>`;
        } else if (currentZone.id === 'experience') {
            config.experience.forEach(exp => html += `<div class="panel-item"><h3>${exp.title}</h3><span class="meta">${exp.company}</span><p>${exp.description}</p></div>`);
        } else if (currentZone.id === 'projects') {
            config.projects.forEach(proj => {
                let tagsHtml = proj.tags ? proj.tags.map(t => `<span class="project-tag">${t}</span>`).join('') : '';
                html += `
                <div class="project-card" style="background:${proj.gradient}">
                    <img src="${proj.image}" class="project-img">
                    <div class="project-info">
                        <h3>${proj.name}</h3>
                        <p style="font-size:0.9rem; margin:5px 0 10px 0; color:#ddd;">${proj.description}</p>
                        <div class="tags-container">${tagsHtml}</div>
                    </div>
                </div>`;
            });
        } else if (currentZone.id === 'skills') {
            config.skills.forEach(cat => {
                html += `<h3>${cat.category}</h3>`;
                cat.items.forEach(skill => html += `<span class="skill-tag">${skill.name}</span>`);
            });
        } else if (currentZone.id === 'education') {
             // FIX 1: ADDED DESCRIPTION
             config.education.forEach(edu => html += `<div class="panel-item"><h3>${edu.degree}</h3><span class="meta">${edu.institution}</span><p>${edu.description}</p></div>`);
        } else if (currentZone.id === 'certifications') {
             config.certifications.forEach(cert => {
                 html += `
                 <div class="cert-card" style="border-left: 3px solid #f1c40f; background: rgba(255,255,255,0.05); padding: 15px; margin-bottom: 15px; border-radius: 0 8px 8px 0;">
                    <h4 style="margin:0; color:#fff; font-size:1.1rem;">${cert.name}</h4>
                    <div style="font-size:0.8rem; color:#aaa; margin: 5px 0;">
                        <span class="issuer">${cert.issuer}</span> | <span class="date">${cert.date}</span>
                    </div>
                    <p style="font-size:0.9rem; color:#ccc; margin-bottom:8px;">${cert.desc}</p>
                    <a href="${cert.url}" target="_blank" style="display:inline-block; padding: 5px 10px; background:rgba(241, 196, 15, 0.2); color:#f1c40f; text-decoration:none; font-size:0.8rem; border:1px solid #f1c40f; border-radius:4px; transition:0.3s; pointer-events: auto;">
                        🔗 View Certificate
                    </a>
                 </div>`;
             });
        } else if (currentZone.id === 'contact') {
            config.contact.links.forEach(link => html += `<a href="${link.url}" class="contact-link"><span class="contact-icon">${link.icon}</span> ${link.text}</a>`);
        }

        if(html === '') panel.classList.add('hidden');
        else { panel.innerHTML = `<div class="panel-content">${html}</div>`; panel.classList.remove('hidden'); }
    }
}

function animate() {
    requestAnimationFrame(animate);
    scrollPos += (targetScrollPos - scrollPos) * 0.05;
    const z = -scrollPos;
    const charX = getPathX(z);
    
    // --- PORTAL & BACKGROUND ANIMATION ---
    if(portalMesh) {
        portalMesh.rotation.z += 0.01;
        portalMesh.material.opacity = 0.8 + Math.sin(Date.now() * 0.005) * 0.2;
        
        // Shortened transition distance (20 units)
        if (Math.abs(totalLength - scrollPos) < 20) {
            const progress = 1 - (Math.abs(totalLength - scrollPos) / 20);
            
            // 1. Expand Portal
            const scale = 1 + progress * 80; 
            portalMesh.scale.set(scale, scale, 1);
            
            // 2. Fade Background to Cyan
            scene.background.lerpColors(new THREE.Color(0x0f0c29), new THREE.Color(0x00ffff), progress * 0.5);
            scene.fog.color.lerpColors(new THREE.Color(0x1a1a2e), new THREE.Color(0x00ffff), progress * 0.5);
            scene.fog.density = 0.008 + progress * 0.02; 
        } else {
            portalMesh.scale.set(1, 1, 1);
            scene.background.set(0x0f0c29);
            scene.fog.color.set(0x1a1a2e);
            scene.fog.density = 0.008;
        }
    }

    // --- PHYSICS: PREVENT SINKING ---
    if (groundMesh) {
        rayOrigin.set(charX, 50, z); 
        raycaster.set(rayOrigin, rayDir);
        const intersects = raycaster.intersectObject(groundMesh);
        if (intersects.length > 0) {
            characterGroup.position.y = intersects[0].point.y + 0.45;
        }
    }

    characterGroup.position.z = z;
    characterGroup.position.x = charX;
    
    const nextX = getPathX(z - 1);
    characterGroup.rotation.y = Math.atan2(charX - nextX, 1) + Math.PI;

    // --- END STATE ---
    if (Math.abs(scrollPos - totalLength) < 1) {
        if(speechBubble) speechBubble.style.opacity = '1';
        characterGroup.userData.limbs.legL.rotation.x = THREE.MathUtils.lerp(characterGroup.userData.limbs.legL.rotation.x, 0, 0.1);
        characterGroup.userData.limbs.legR.rotation.x = THREE.MathUtils.lerp(characterGroup.userData.limbs.legR.rotation.x, 0, 0.1);
        characterGroup.userData.limbs.armL.rotation.x = THREE.MathUtils.lerp(characterGroup.userData.limbs.armL.rotation.x, 0, 0.1);
        characterGroup.userData.limbs.armR.rotation.x = THREE.MathUtils.lerp(characterGroup.userData.limbs.armR.rotation.x, 0, 0.1);
    } else {
        if(speechBubble) speechBubble.style.opacity = '0';
        
        if (Math.abs(targetScrollPos - scrollPos) > 0.1) {
            const t = Date.now() * 0.01;
            characterGroup.userData.limbs.legL.rotation.x = Math.sin(t) * 0.6;
            characterGroup.userData.limbs.legR.rotation.x = Math.sin(t + Math.PI) * 0.6;
            characterGroup.userData.limbs.armL.rotation.x = Math.sin(t + Math.PI) * 0.3; 
            characterGroup.userData.limbs.armR.rotation.x = Math.sin(t) * 0.3;
        }
    }

    const camTargetZ = z + 15;
    camera.position.z += (camTargetZ - camera.position.z) * 0.05;
    camera.position.x += (getPathX(camTargetZ) - camera.position.x) * 0.05;
    
    const lookAtY = window.innerWidth < 768 ? 3 : (2 + mouse.y * 5);
    camera.lookAt(charX + mouse.x * 5, lookAtY, z - 10);

    updateUI(z);
    composer.render();
}

init();

