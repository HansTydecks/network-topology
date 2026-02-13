/* ============================================================
   ui.js – SVG-Rendering, Interaktion & Analyse-Panel
   ============================================================ */

const UI = (() => {
    'use strict';

    // ── DOM-Referenzen ───────────────────────────────────────
    const svg = document.getElementById('network-svg');
    const modeIndicator = document.getElementById('mode-indicator');
    const edgeHint = document.getElementById('edge-hint');

    // Selects
    const simStart = document.getElementById('sim-start');
    const simEnd = document.getElementById('sim-end');

    // Stats
    const statN = document.getElementById('stat-n');
    const statM = document.getElementById('stat-m');
    const statConn = document.getElementById('stat-connected');
    const statCycles = document.getElementById('stat-cycles');
    const statComplete = document.getElementById('stat-complete');
    const statTree = document.getElementById('stat-tree');
    const statCable = document.getElementById('stat-cable');
    const statRedundancy = document.getElementById('stat-redundancy');
    const statChromatic = document.getElementById('stat-chromatic');

    const topologyName = document.getElementById('topology-name');
    const degreeList = document.getElementById('degree-list');
    const bridgesList = document.getElementById('bridges-list');
    const articulationList = document.getElementById('articulation-list');
    const traversalResult = document.getElementById('traversal-result');
    const simResult = document.getElementById('sim-result');
    const failureResult = document.getElementById('failure-result');
    const coloringResult = document.getElementById('coloring-result');

    const matrixOverlay = document.getElementById('matrix-overlay');
    const matrixContent = document.getElementById('matrix-content');

    const discoveredList = document.getElementById('discovered-list');
    const discoveredSection = document.getElementById('discovered-section');

    // Mode state
    let currentMode = 'normal'; // 'normal' | 'delete' | 'failure' | 'edge-start'
    let edgeStartNode = null;
    let advancedMode = false;
    let showMatrix = false;

    // Drag state
    let dragNode = null;
    let dragOffset = { x: 0, y: 0 };
    let dragStartPos = { x: 0, y: 0 };
    let didDrag = false;
    const DRAG_THRESHOLD = 5;

    // Discovered topologies
    let discoveredTopologies = new Set();

    // ── SVG namespace helper ────────────────────────────────
    function svgEl(tag) { return document.createElementNS('http://www.w3.org/2000/svg', tag); }

    // ── MODE MANAGEMENT ─────────────────────────────────────

    function setMode(mode) {
        currentMode = mode;
        edgeStartNode = null;
        edgeHint.classList.add('hidden');

        const labels = {
            'normal': I18n.t('modeNormal'),
            'delete': I18n.t('modeDelete'),
            'failure': I18n.t('modeFailure'),
            'edge-start': I18n.t('modeEdge')
        };
        modeIndicator.textContent = labels[mode] || I18n.t('modeNormal');

        document.getElementById('btn-delete-mode').classList.toggle('active', mode === 'delete');
        document.getElementById('btn-failure-mode').classList.toggle('active', mode === 'failure');
    }

    function toggleMode(mode) {
        setMode(currentMode === mode ? 'normal' : mode);
    }

    function getMode() { return currentMode; }

    // ── ADVANCED MODE ─────────────────────────────────────────

    function setAdvancedMode(val) {
        advancedMode = !!val;
        document.querySelectorAll('.advanced-only').forEach(el => {
            el.classList.toggle('hidden', !advancedMode);
        });
        document.querySelectorAll('.advanced-row').forEach(el => {
            el.classList.toggle('hidden', !advancedMode);
        });
        if (!advancedMode) {
            showMatrix = false;
            matrixOverlay.classList.add('hidden');
            document.getElementById('toggle-matrix').checked = false;
        }
        render();
        updateAnalysis();
    }

    function isAdvancedMode() { return advancedMode; }

    // ── MATRIX ──────────────────────────────────────────────

    function toggleMatrix(val) {
        showMatrix = val;
        if (showMatrix) {
            renderMatrix();
            matrixOverlay.classList.remove('hidden');
        } else {
            matrixOverlay.classList.add('hidden');
        }
    }

    function renderMatrix() {
        const data = Graph.getAdjacencyMatrix();
        if (data.nodes.length === 0) {
            matrixContent.innerHTML = '<p style="font-size:.8rem;color:var(--text-muted);">Keine Knoten vorhanden.</p>';
            return;
        }
        const nodes = data.nodes;
        const matrix = data.matrix;
        let html = '<table><tr><th></th>';
        nodes.forEach(n => { html += `<th>${n}</th>`; });
        html += '</tr>';
        for (let i = 0; i < nodes.length; i++) {
            html += `<tr><th>${nodes[i]}</th>`;
            for (let j = 0; j < nodes.length; j++) {
                const v = matrix[i][j];
                const cls = v > 1 ? 'cell-weight' : (v === 1 ? 'cell-1' : '');
                html += `<td class="${cls}">${v}</td>`;
            }
            html += '</tr>';
        }
        html += '</table>';
        matrixContent.innerHTML = html;
    }

    // ── TOPOLOGY DISCOVERY ──────────────────────────────────

    function discoverTopology(key) {
        if (!key || key === 'leer' || key === 'einzelknoten') return;
        if (discoveredTopologies.has(key)) return;
        discoveredTopologies.add(key);
        saveDiscoveredTopologies();
        renderDiscoveredTopologies();
        showFeedback('🏆', `Neue Topologie entdeckt: ${Graph.TOPOLOGY_INFO[key]?.name || key}!`);
    }

    function renderDiscoveredTopologies() {
        const validTopologies = ['linie', 'ring', 'stern', 'baum', 'vollvermascht', 'teilvermascht', 'nicht zusammenhängend', 'gerichteter graph'];
        let html = '';
        let count = 0;
        validTopologies.forEach(key => {
            const info = Graph.TOPOLOGY_INFO[key];
            if (!info) return;
            const discovered = discoveredTopologies.has(key);
            if (discovered) count++;
            html += `<button class="topo-badge ${discovered ? 'discovered' : 'locked'}" 
                        data-topology="${key}" 
                        ${discovered ? '' : 'disabled'}
                        title="${discovered ? info.name + ' – Klicke für Details' : '???'}">
                        ${discovered ? info.name : '🔒'}
                    </button>`;
        });
        discoveredList.innerHTML = html || '<p class="hint-text">Baue ein Netzwerk, um Topologien zu entdecken!</p>';
        discoveredSection.querySelector('h3').textContent = `🏆 Entdeckte Topologien (${count}/${validTopologies.length})`;

        // Add click events
        discoveredList.querySelectorAll('.topo-badge.discovered').forEach(btn => {
            btn.addEventListener('click', () => {
                openTopologyPopup(btn.dataset.topology);
            });
        });
    }

    function openTopologyPopup(key) {
        const info = Graph.getTopologyInfo(key);
        if (!info) return;
        document.getElementById('topo-popup-title').textContent = info.name;
        document.getElementById('topo-popup-definition').textContent = info.definition || '—';
        document.getElementById('topo-popup-usage').textContent = info.usage || '—';
        document.getElementById('topo-popup-cable').textContent = info.cable || '—';
        document.getElementById('topo-popup-redundancy').textContent = info.redundancy || '—';
        document.getElementById('topo-popup-pros').textContent = info.pros || '—';
        document.getElementById('topo-popup-cons').textContent = info.cons || '—';
        document.getElementById('topology-popup').classList.remove('hidden');
    }

    function closeTopologyPopup() {
        document.getElementById('topology-popup').classList.add('hidden');
    }

    function saveDiscoveredTopologies() {
        localStorage.setItem('discovered-topologies', JSON.stringify([...discoveredTopologies]));
    }

    function loadDiscoveredTopologies() {
        try {
            const data = JSON.parse(localStorage.getItem('discovered-topologies') || '[]');
            discoveredTopologies = new Set(data);
        } catch { discoveredTopologies = new Set(); }
        renderDiscoveredTopologies();
    }

    // ── RENDER ──────────────────────────────────────────────

    function render() {
        // Clear SVG (keep defs)
        const defs = svg.querySelector('defs');
        svg.innerHTML = '';
        svg.appendChild(defs);

        const edges = Graph.getEdges();
        const nodes = Graph.getNodes();
        const bridges = advancedMode ? Graph.findBridges() : [];
        const bridgeSet = new Set(bridges.map(([a, b]) => Graph.edgeKey(a, b)));
        const articulationPts = advancedMode ? Graph.findArticulationPoints() : [];
        const articulationSet = new Set(articulationPts);
        const nodeColors = Graph.getNodeColors();
        const isDir = Graph.isDirected();
        const showWeights = Graph.getUseWeights();

        // ── Edges ──
        edges.forEach(([a, b]) => {
            const pa = Graph.getNodePosition(a);
            const pb = Graph.getNodePosition(b);
            if (!pa || !pb) return;

            const disabled = Graph.isEdgeDisabled(a, b);
            const isBridge = bridgeSet.has(Graph.edgeKey(a, b));

            // Hit area (wider invisible line for clicking)
            const hit = svgEl('line');
            hit.setAttribute('x1', pa.x);
            hit.setAttribute('y1', pa.y);
            hit.setAttribute('x2', pb.x);
            hit.setAttribute('y2', pb.y);
            hit.setAttribute('class', 'edge-hit-area');
            hit.dataset.from = a;
            hit.dataset.to = b;
            svg.appendChild(hit);

            // Visible edge
            const line = svgEl('line');
            line.setAttribute('x1', pa.x);
            line.setAttribute('y1', pa.y);
            line.setAttribute('x2', pb.x);
            line.setAttribute('y2', pb.y);
            let className = 'edge-line';
            if (disabled) className += ' disabled';
            else if (isBridge) className += ' bridge';
            line.setAttribute('class', className);
            line.dataset.from = a;
            line.dataset.to = b;

            // Arrow markers for directed edges
            if (isDir) {
                if (disabled) {
                    line.setAttribute('marker-end', 'url(#arrowhead-disabled)');
                } else if (isBridge) {
                    line.setAttribute('marker-end', 'url(#arrowhead-bridge)');
                } else {
                    line.setAttribute('marker-end', 'url(#arrowhead)');
                }
            }

            svg.appendChild(line);

            // Weight label
            if (showWeights) {
                const w = Graph.getEdgeWeight(a, b);
                const mx = (pa.x + pb.x) / 2;
                const my = (pa.y + pb.y) / 2;
                // Background rect
                const bg = svgEl('rect');
                bg.setAttribute('class', 'edge-weight-bg');
                bg.setAttribute('x', mx - 10);
                bg.setAttribute('y', my - 8);
                bg.setAttribute('width', 20);
                bg.setAttribute('height', 16);
                svg.appendChild(bg);
                // Text
                const txt = svgEl('text');
                txt.setAttribute('class', 'edge-weight-label');
                txt.setAttribute('x', mx);
                txt.setAttribute('y', my);
                txt.textContent = w;
                svg.appendChild(txt);
            }
        });

        // ── Nodes ──
        nodes.forEach(id => {
            const pos = Graph.getNodePosition(id);
            if (!pos) return;

            const g = svgEl('g');
            g.setAttribute('class', 'node-group');
            g.dataset.id = id;

            const circle = svgEl('circle');
            circle.setAttribute('cx', pos.x);
            circle.setAttribute('cy', pos.y);
            circle.setAttribute('r', 20);
            let cls = 'node-circle';
            if (articulationSet.has(id)) cls += ' articulation';
            if (nodeColors[id] !== undefined) cls += ` colored color-${nodeColors[id] % 8}`;
            circle.setAttribute('class', cls);
            g.appendChild(circle);

            const label = svgEl('text');
            label.setAttribute('x', pos.x);
            label.setAttribute('y', pos.y);
            label.setAttribute('class', 'node-label');
            label.textContent = id;
            g.appendChild(label);

            svg.appendChild(g);
        });

        // Update selects
        updateSelects();
        updateAnalysis();

        if (showMatrix) renderMatrix();
    }

    // ── UPDATE SELECTS ──────────────────────────────────────

    function updateSelects() {
        const nodes = Graph.getNodes();
        [simStart, simEnd].forEach(sel => {
            const prev = sel.value;
            sel.innerHTML = '<option value="">—</option>';
            nodes.forEach(id => {
                const opt = document.createElement('option');
                opt.value = id;
                opt.textContent = id;
                sel.appendChild(opt);
            });
            if (nodes.includes(prev)) sel.value = prev;
        });
    }

    // ── UPDATE ANALYSIS ─────────────────────────────────────

    function updateAnalysis() {
        const n = Graph.nodeCount();
        const m = Graph.edgeCount();

        statN.textContent = n;
        statM.textContent = m;

        if (n === 0) {
            statConn.textContent = '—';
            statCycles.textContent = '—';
            statComplete.textContent = '—';
            statTree.textContent = '—';
            statCable.textContent = '—';
            statRedundancy.textContent = '—';
            statChromatic.textContent = '—';
            topologyName.textContent = '—';
            topologyName.className = 'topology-badge';
            if (degreeList) degreeList.textContent = '—';
            if (bridgesList) bridgesList.textContent = '—';
            if (articulationList) articulationList.textContent = '—';
            return;
        }

        const connected = Graph.isConnected();
        statConn.textContent = connected ? '✅ Ja' : '❌ Nein';
        statConn.style.color = connected ? 'var(--success)' : 'var(--error)';

        statComplete.textContent = Graph.isComplete() ? '✅ Ja' : '❌ Nein';
        statTree.textContent = Graph.isTree() ? '✅ Ja' : '❌ Nein';

        // Advanced stats
        if (advancedMode) {
            statCycles.textContent = Graph.hasCycle() ? '✅ Ja' : '❌ Nein';
            statCable.textContent = `${m} Kabel`;
            const r = Graph.redundancy();
            statRedundancy.textContent = `${(r * 100).toFixed(0)}%`;
            statChromatic.textContent = Graph.chromaticNumber() || '—';

            // Degrees
            if (degreeList) {
                if (Graph.isDirected()) {
                    const iod = Graph.inOutDegrees();
                    let html = '';
                    Object.keys(iod).sort().forEach(id => {
                        html += `<span class="degree-item">${id}: in=${iod[id].in} out=${iod[id].out}</span> `;
                    });
                    degreeList.innerHTML = html || '—';
                } else {
                    const degs = Graph.degrees();
                    let html = '';
                    Object.keys(degs).sort().forEach(id => {
                        html += `<span class="degree-item">${id}: ${degs[id]}</span> `;
                    });
                    degreeList.innerHTML = html || '—';
                }
            }

            // Bridges
            if (bridgesList) {
                const bridges = Graph.findBridges();
                bridgesList.textContent = bridges.length > 0
                    ? bridges.map(([a, b]) => `${a}–${b}`).join(', ')
                    : 'Keine';
            }

            // Articulation Points
            if (articulationList) {
                const aps = Graph.findArticulationPoints();
                articulationList.textContent = aps.length > 0 ? aps.join(', ') : 'Keine';
            }
        }

        // Topology
        const topoKey = Graph.detectTopology();
        const topoInfo = Graph.TOPOLOGY_INFO[topoKey];
        topologyName.textContent = topoInfo ? topoInfo.name : topoKey;
        topologyName.className = 'topology-badge active';
        topologyName.dataset.topology = topoKey;

        // Discover topology
        discoverTopology(topoKey);
    }

    // ── NODE INTERACTION ────────────────────────────────────

    function setupSVGListeners() {
        svg.addEventListener('pointerdown', onPointerDown);
        svg.addEventListener('pointermove', onPointerMove);
        svg.addEventListener('pointerup', onPointerUp);
    }

    function getNodeAt(e) {
        const g = e.target.closest('.node-group');
        return g ? g.dataset.id : null;
    }

    function getEdgeAt(e) {
        const el = e.target;
        if (el.classList.contains('edge-line') || el.classList.contains('edge-hit-area')) {
            return { from: el.dataset.from, to: el.dataset.to };
        }
        return null;
    }

    function onPointerDown(e) {
        const nodeId = getNodeAt(e);
        const edgeInfo = getEdgeAt(e);

        if (currentMode === 'delete') {
            if (nodeId) {
                Graph.removeNode(nodeId);
                render();
            } else if (edgeInfo) {
                Graph.removeEdge(edgeInfo.from, edgeInfo.to);
                render();
            }
            return;
        }

        if (currentMode === 'failure') {
            if (edgeInfo) {
                const isNowDisabled = Graph.toggleEdgeDisabled(edgeInfo.from, edgeInfo.to);
                showFailureInfo(edgeInfo.from, edgeInfo.to, isNowDisabled);
                render();
            }
            return;
        }

        if (nodeId) {
            if (currentMode === 'edge-start' && edgeStartNode) {
                // Second node clicked → create edge
                if (edgeStartNode !== nodeId) {
                    if (Graph.getUseWeights()) {
                        showWeightDialog(edgeStartNode, nodeId);
                    } else {
                        Graph.addEdge(edgeStartNode, nodeId);
                    }
                }
                setMode('normal');
                render();
                return;
            }

            // Start edge creation or drag
            setMode('edge-start');
            edgeStartNode = nodeId;  // AFTER setMode, because setMode resets edgeStartNode
            edgeHint.classList.remove('hidden');
            highlightNode(nodeId, true);

            // Prepare for drag
            const pos = Graph.getNodePosition(nodeId);
            const pt = svg.createSVGPoint();
            pt.x = e.clientX;
            pt.y = e.clientY;
            const svgP = pt.matrixTransform(svg.getScreenCTM().inverse());
            dragOffset.x = svgP.x - pos.x;
            dragOffset.y = svgP.y - pos.y;
            dragStartPos.x = e.clientX;
            dragStartPos.y = e.clientY;
            didDrag = false;
            dragNode = nodeId;
        }
    }

    function onPointerMove(e) {
        if (!dragNode) return;
        const dx = e.clientX - dragStartPos.x;
        const dy = e.clientY - dragStartPos.y;
        if (!didDrag && Math.sqrt(dx * dx + dy * dy) < DRAG_THRESHOLD) return;
        didDrag = true;
        const pt = svg.createSVGPoint();
        pt.x = e.clientX;
        pt.y = e.clientY;
        const svgP = pt.matrixTransform(svg.getScreenCTM().inverse());
        Graph.setNodePosition(dragNode, svgP.x - dragOffset.x, svgP.y - dragOffset.y);
        render();
    }

    function onPointerUp(e) {
        if (dragNode) {
            if (didDrag) {
                // It was a real drag → cancel edge-start
                if (currentMode === 'edge-start') setMode('normal');
            }
            // If !didDrag → it was a click-in-place, keep edge-start mode
            dragNode = null;
            didDrag = false;
        }
    }

    // ── WEIGHT DIALOG ───────────────────────────────────────

    function showWeightDialog(a, b) {
        const dialog = document.getElementById('weight-dialog');
        const input = document.getElementById('weight-dialog-input');
        const defaultWeight = document.getElementById('edge-weight')?.value || 1;
        input.value = defaultWeight;
        dialog.classList.remove('hidden');
        input.focus();

        function finish(confirmed) {
            dialog.classList.add('hidden');
            okBtn.removeEventListener('click', onOk);
            cancelBtn.removeEventListener('click', onCancel);
            input.removeEventListener('keydown', onKey);

            if (confirmed) {
                const w = parseInt(input.value, 10) || 1;
                Graph.addEdge(a, b, w);
                Graph.setEdgeWeight(a, b, w);
            }
            render();
        }

        const okBtn = document.getElementById('weight-dialog-ok');
        const cancelBtn = document.getElementById('weight-dialog-cancel');

        function onOk() { finish(true); }
        function onCancel() { finish(false); }
        function onKey(e) { if (e.key === 'Enter') finish(true); else if (e.key === 'Escape') finish(false); }

        okBtn.addEventListener('click', onOk);
        cancelBtn.addEventListener('click', onCancel);
        input.addEventListener('keydown', onKey);
    }

    // ── HIGHLIGHTING ────────────────────────────────────────

    function highlightNode(id, selected) {
        const g = svg.querySelector(`.node-group[data-id="${id}"]`);
        if (g) {
            const circle = g.querySelector('.node-circle');
            circle.classList.toggle('selected', selected);
        }
    }

    function clearHighlights() {
        svg.querySelectorAll('.node-circle.selected').forEach(el => el.classList.remove('selected'));
        svg.querySelectorAll('.node-circle.sim-active').forEach(el => el.classList.remove('sim-active'));
        svg.querySelectorAll('.node-circle.dfs-active').forEach(el => el.classList.remove('dfs-active'));
        svg.querySelectorAll('.edge-line.sim-active').forEach(el => el.classList.remove('sim-active'));
        svg.querySelectorAll('.edge-line.sim-flood').forEach(el => el.classList.remove('sim-flood'));
        svg.querySelectorAll('.edge-line.dfs-active').forEach(el => el.classList.remove('dfs-active'));
        svg.querySelectorAll('.sim-packet').forEach(el => el.remove());
    }

    // ── SIM RESULT DISPLAY ──────────────────────────────────

    function showSimResult(html) {
        simResult.innerHTML = html;
        simResult.classList.remove('hidden');
    }

    function showFloodResult(html) {
        simResult.innerHTML = html;
        simResult.classList.remove('hidden');
    }

    function showFailureInfo(a, b, disabled) {
        failureResult.innerHTML = disabled
            ? `Kante <strong>${a}–${b}</strong> deaktiviert. Netzwerk ${Graph.isConnected(Graph.activeAdjacency()) ? 'noch zusammenhängend ✅' : 'getrennt! ❌'}`
            : `Kante <strong>${a}–${b}</strong> wiederhergestellt.`;
        failureResult.classList.remove('hidden');
    }

    function showColoringResult(numColors) {
        coloringResult.innerHTML = `Graphfärbung: <strong>${numColors}</strong> Farbe${numColors !== 1 ? 'n' : ''} benötigt (Greedy).`;
        coloringResult.classList.remove('hidden');
    }

    function showTraversalResult(type, order) {
        if (!order || order.length === 0) {
            traversalResult.innerHTML = '<em>Kein Ergebnis.</em>';
            return;
        }
        const isDFS = type === 'DFS';
        let html = `<div class="traversal-order"><strong>${type}-Reihenfolge:</strong><br>`;
        order.forEach((id, i) => {
            html += `<span class="traversal-step ${isDFS ? 'dfs-step' : ''}">${i + 1}. ${id}</span> `;
        });
        html += '</div>';
        traversalResult.innerHTML = html;
    }

    // ── SIM ANIMATION HELPERS ───────────────────────────────

    function animateNodeSim(nodeId, className) {
        const g = svg.querySelector(`.node-group[data-id="${nodeId}"]`);
        if (g) g.querySelector('.node-circle').classList.add(className || 'sim-active');
    }

    function animateEdgeSim(a, b, className) {
        const sel = `.edge-line[data-from="${a}"][data-to="${b}"], .edge-line[data-from="${b}"][data-to="${a}"]`;
        svg.querySelectorAll(sel).forEach(el => el.classList.add(className || 'sim-active'));
    }

    function createPacket(x, y) {
        const c = svgEl('circle');
        c.setAttribute('cx', x);
        c.setAttribute('cy', y);
        c.setAttribute('r', 7);
        c.setAttribute('class', 'sim-packet');
        svg.appendChild(c);
        return c;
    }

    function animatePacketAlongEdge(a, b, done) {
        const pa = Graph.getNodePosition(a);
        const pb = Graph.getNodePosition(b);
        if (!pa || !pb) { done(); return; }
        const packet = createPacket(pa.x, pa.y);
        const duration = 300;
        const startTime = performance.now();
        function step(time) {
            const t = Math.min((time - startTime) / duration, 1);
            packet.setAttribute('cx', pa.x + (pb.x - pa.x) * t);
            packet.setAttribute('cy', pa.y + (pb.y - pa.y) * t);
            if (t < 1) {
                requestAnimationFrame(step);
            } else {
                packet.remove();
                done();
            }
        }
        requestAnimationFrame(step);
    }

    // ── FEEDBACK POPUP ──────────────────────────────────────

    function showFeedback(icon, text) {
        const popup = document.getElementById('feedback-popup');
        document.getElementById('feedback-icon').textContent = icon;
        document.getElementById('feedback-text').textContent = text;
        popup.classList.remove('hidden');
        // Force reflow so transition triggers
        void popup.offsetWidth;
        popup.classList.add('show');
        setTimeout(() => {
            popup.classList.remove('show');
            setTimeout(() => popup.classList.add('hidden'), 300);
        }, 2500);
    }

    // ── MASCOT POPUP ────────────────────────────────────────

    function openMascotPopup(infoKey) {
        const textEl = document.getElementById('mascot-text');
        const imgEl = document.getElementById('mascot-img');
        const popup = document.getElementById('mascot-popup');
        const translatedText = I18n.t('info' + infoKey.charAt(0).toUpperCase() + infoKey.slice(1));
        textEl.innerHTML = translatedText;
        // Use thinking image for more complex concepts
        const thinkingTopics = ['coloring', 'matrix', 'dfs', 'bfs'];
        if (thinkingTopics.includes(infoKey)) {
            imgEl.src = 'mascot_Byte/Info_Byte_thinking.png';
        } else {
            imgEl.src = 'mascot_Byte/Info_Byte_normal_happy.png';
        }
        popup.classList.remove('hidden');
    }

    function closeMascotPopup() {
        document.getElementById('mascot-popup').classList.add('hidden');
    }

    // ── I18N / TRANSLATIONS ─────────────────────────────────

    function applyTranslations() {
        // Translate all elements with data-i18n (textContent)
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            const val = I18n.t(key);
            if (val && val !== key) {
                el.textContent = val;
            }
        });
        // Translate all elements with data-i18n-html (innerHTML)
        document.querySelectorAll('[data-i18n-html]').forEach(el => {
            const key = el.getAttribute('data-i18n-html');
            const val = I18n.t(key);
            if (val && val !== key) {
                el.innerHTML = val;
            }
        });
        // Update mode indicator
        const labels = {
            'normal': I18n.t('modeNormal'),
            'delete': I18n.t('modeDelete'),
            'failure': I18n.t('modeFailure'),
            'edge-start': I18n.t('modeEdge')
        };
        modeIndicator.textContent = labels[currentMode] || I18n.t('modeNormal');

        // Update language flag active state
        document.querySelectorAll('.lang-flag').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.lang === I18n.getLang());
        });

        // Re-render discovered topologies
        renderDiscoveredTopologies();
    }

    // ── PUBLIC API ──────────────────────────────────────────

    return {
        render, setMode, toggleMode, getMode,
        setAdvancedMode, isAdvancedMode, toggleMatrix,
        setupSVGListeners,
        clearHighlights, highlightNode,
        animateNodeSim, animateEdgeSim, animatePacketAlongEdge,
        showSimResult, showFloodResult, showFailureInfo,
        showColoringResult, showTraversalResult,
        showFeedback, showWeightDialog,
        openTopologyPopup, closeTopologyPopup,
        openMascotPopup, closeMascotPopup,
        applyTranslations,
        loadDiscoveredTopologies, discoverTopology, renderDiscoveredTopologies,
        updateAnalysis, updateSelects
    };
})();
