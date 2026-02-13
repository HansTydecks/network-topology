/* ============================================================
   script.js – Haupteinstiegspunkt & Gamification
   ============================================================ */

(function () {
    'use strict';

    // ── Gamification ────────────────────────────────────────

    const Gamification = (() => {
        const tasks = [
            { id: 'add3', labelKey: 'task_add3', check: () => Graph.nodeCount() >= 3 },
            { id: 'edge1', labelKey: 'task_edge1', check: () => Graph.edgeCount() >= 1 },
            { id: 'star', labelKey: 'task_star', check: () => Graph.detectTopology() === 'stern' },
            { id: 'ring', labelKey: 'task_ring', check: () => Graph.detectTopology() === 'ring' },
            { id: 'line', labelKey: 'task_line', check: () => Graph.detectTopology() === 'linie' },
            { id: 'tree', labelKey: 'task_tree', check: () => Graph.isTree() && Graph.nodeCount() >= 4 },
            { id: 'mesh', labelKey: 'task_mesh', check: () => Graph.detectTopology() === 'vollvermascht' },
            { id: 'sim', labelKey: 'task_sim', check: () => Gamification._simDone },
            { id: 'failure', labelKey: 'task_failure', check: () => Gamification._failureDone }
        ];

        let completed = new Set();
        let _simDone = false;
        let _failureDone = false;

        function init() {
            load();
            renderTasks();
            updateProgress();
        }

        function renderTasks() {
            const ul = document.getElementById('task-list');
            ul.innerHTML = '';
            tasks.forEach(t => {
                const li = document.createElement('li');
                const label = I18n.t(t.labelKey);
                li.className = completed.has(t.id) ? 'task-done' : '';
                li.innerHTML = `<span class="task-check">${completed.has(t.id) ? '✅' : '⬜'}</span> ${label}`;
                ul.appendChild(li);
            });
        }

        function check() {
            let changed = false;
            tasks.forEach(t => {
                if (!completed.has(t.id) && t.check()) {
                    completed.add(t.id);
                    changed = true;
                    UI.showFeedback('🎉', `${I18n.t('taskCompleted')} ${I18n.t(t.labelKey)}`);
                }
            });
            if (changed) {
                save();
                renderTasks();
                updateProgress();
            }
        }

        function updateProgress() {
            const total = tasks.length;
            const done = completed.size;
            const bar = document.getElementById('progress-bar');
            const text = document.getElementById('progress-text');
            bar.style.width = `${(done / total) * 100}%`;
            text.textContent = `${done} / ${total}`;
        }

        function markSim() { _simDone = true; check(); }
        function markFailure() { _failureDone = true; check(); }

        function save() {
            localStorage.setItem('topo-tasks', JSON.stringify([...completed]));
        }

        function load() {
            try {
                const data = JSON.parse(localStorage.getItem('topo-tasks') || '[]');
                completed = new Set(data);
            } catch { completed = new Set(); }
        }

        return { init, check, markSim, markFailure, _simDone, _failureDone, renderTasks };
    })();

    // ── Boot ────────────────────────────────────────────────

    document.addEventListener('DOMContentLoaded', () => {
        // ── LANGUAGE INIT ───────────────────────────────────
        I18n.loadLang();
        UI.applyTranslations();

        UI.setupSVGListeners();
        UI.loadDiscoveredTopologies();
        Gamification.init();

        // Try auto-load
        const saved = localStorage.getItem('topo-graph');
        if (saved && Graph.deserialize(saved)) {
            // Restore advanced toggles
            document.getElementById('toggle-directed').checked = Graph.isDirected();
            document.getElementById('toggle-weights').checked = Graph.getUseWeights();
            UI.render();
        }

        // ── BUTTON EVENTS ───────────────────────────────────

        document.getElementById('btn-add-node').addEventListener('click', () => {
            const svgRect = document.getElementById('network-svg').getBoundingClientRect();
            const x = 80 + Math.random() * (svgRect.width - 160);
            const y = 80 + Math.random() * (svgRect.height - 160);
            Graph.addNode(x, y);
            UI.setMode('normal');
            UI.render();
            Gamification.check();
        });

        document.getElementById('btn-delete-mode').addEventListener('click', () => {
            UI.toggleMode('delete');
        });

        document.getElementById('btn-failure-mode').addEventListener('click', () => {
            UI.toggleMode('failure');
        });

        document.getElementById('btn-reset').addEventListener('click', () => {
            if (confirm('Netzwerk wirklich zurücksetzen?')) {
                Graph.reset();
                UI.setMode('normal');
                UI.clearHighlights();
                UI.render();
            }
        });

        document.getElementById('btn-reset-failures').addEventListener('click', () => {
            Graph.resetFailures();
            UI.render();
            UI.showFeedback('✅', 'Alle Ausfälle zurückgesetzt.');
        });

        // ── SIMULATION ──────────────────────────────────────

        document.getElementById('btn-simulate').addEventListener('click', () => {
            const start = document.getElementById('sim-start').value;
            const end = document.getElementById('sim-end').value;
            if (!start || !end) { UI.showFeedback('⚠️', 'Bitte Start- und Zielknoten auswählen.'); return; }
            if (start === end) { UI.showFeedback('⚠️', 'Start und Ziel müssen unterschiedlich sein.'); return; }

            UI.clearHighlights();
            UI.setMode('normal');

            Simulation.simulatePath(start, end,
                (node) => UI.animateNodeSim(node, 'sim-active'),
                (a, b) => UI.animateEdgeSim(a, b, 'sim-active'),
                (path) => {
                    if (!path) {
                        UI.showSimResult('❌ Kein Pfad gefunden!');
                    } else {
                        const alt = Graph.hasAlternativePath(start, end);
                        UI.showSimResult(`✅ Pfad: <strong>${path.join(' → ')}</strong> (${path.length - 1} Hops)${alt ? ' | Alternativer Pfad vorhanden 🔀' : ''}`);
                        Gamification.markSim();
                    }
                }
            );
        });

        document.getElementById('btn-flood').addEventListener('click', () => {
            const start = document.getElementById('sim-start').value;
            if (!start) { UI.showFeedback('⚠️', 'Bitte Startknoten auswählen.'); return; }

            UI.clearHighlights();
            UI.setMode('normal');

            Simulation.simulateFlood(start,
                (node, from) => {
                    UI.animateNodeSim(node, 'sim-active');
                    if (from) UI.animateEdgeSim(from, node, 'sim-flood');
                },
                (steps) => {
                    UI.showFloodResult(`🌊 Flooding abgeschlossen. <strong>${steps.length}</strong> Knoten erreicht.`);
                }
            );
        });

        // ── DFS / BFS TRAVERSAL (Advanced) ──────────────────

        document.getElementById('btn-dfs').addEventListener('click', () => {
            const start = document.getElementById('sim-start').value;
            if (!start) { UI.showFeedback('⚠️', 'Bitte Startknoten auswählen.'); return; }

            UI.clearHighlights();
            UI.setMode('normal');

            Simulation.simulateDFS(start,
                (node) => UI.animateNodeSim(node, 'dfs-active'),
                (a, b) => UI.animateEdgeSim(a, b, 'dfs-active'),
                (order) => {
                    if (!order) {
                        UI.showSimResult('❌ DFS fehlgeschlagen.');
                    } else {
                        UI.showTraversalResult('DFS', order);
                        UI.showSimResult(`🔍 DFS: <strong>${order.join(' → ')}</strong>`);
                    }
                }
            );
        });

        document.getElementById('btn-bfs-traverse').addEventListener('click', () => {
            const start = document.getElementById('sim-start').value;
            if (!start) { UI.showFeedback('⚠️', 'Bitte Startknoten auswählen.'); return; }

            UI.clearHighlights();
            UI.setMode('normal');

            Simulation.simulateBFS(start,
                (node) => UI.animateNodeSim(node, 'sim-active'),
                (a, b) => UI.animateEdgeSim(a, b, 'sim-flood'),
                (order) => {
                    if (!order) {
                        UI.showSimResult('❌ BFS fehlgeschlagen.');
                    } else {
                        UI.showTraversalResult('BFS', order);
                        UI.showSimResult(`📡 BFS: <strong>${order.join(' → ')}</strong>`);
                    }
                }
            );
        });

        // ── ADVANCED MODE TOGGLE ────────────────────────────

        document.getElementById('toggle-advanced').addEventListener('change', (e) => {
            UI.setAdvancedMode(e.target.checked);
        });

        // ── DIRECTED GRAPH TOGGLE ───────────────────────────

        document.getElementById('toggle-directed').addEventListener('change', (e) => {
            Graph.setDirected(e.target.checked);
            UI.render();
        });

        // ── EDGE WEIGHTS TOGGLE ──────────────────────────────

        document.getElementById('toggle-weights').addEventListener('change', (e) => {
            Graph.setUseWeights(e.target.checked);
            UI.render();
        });

        // ── GRAPH COLORING ──────────────────────────────────

        document.getElementById('btn-color-graph').addEventListener('click', () => {
            if (Graph.nodeCount() === 0) { UI.showFeedback('⚠️', 'Keine Knoten vorhanden.'); return; }
            Graph.greedyColoring();
            const cn = Graph.chromaticNumber();
            UI.showColoringResult(cn);
            UI.render();
        });

        document.getElementById('btn-reset-colors').addEventListener('click', () => {
            Graph.resetColors();
            document.getElementById('coloring-result').classList.add('hidden');
            UI.render();
        });

        // ── ADJACENCY MATRIX TOGGLE ─────────────────────────

        document.getElementById('toggle-matrix').addEventListener('change', (e) => {
            UI.toggleMatrix(e.target.checked);
        });

        // ── TOPOLOGY POPUP ──────────────────────────────────

        document.getElementById('btn-close-topo-popup').addEventListener('click', () => {
            UI.closeTopologyPopup();
        });
        document.querySelector('.topology-popup-backdrop').addEventListener('click', () => {
            UI.closeTopologyPopup();
        });

        // Click on current topology badge to open popup
        document.getElementById('topology-name').addEventListener('click', () => {
            const key = document.getElementById('topology-name').dataset.topology;
            if (key && key !== 'leer' && key !== 'einzelknoten') {
                UI.openTopologyPopup(key);
            }
        });

        // ── SAVE / LOAD ─────────────────────────────────────

        document.getElementById('btn-save').addEventListener('click', () => {
            localStorage.setItem('topo-graph', Graph.serialize());
            UI.showFeedback('💾', 'Netzwerk gespeichert!');
        });

        document.getElementById('btn-load').addEventListener('click', () => {
            const data = localStorage.getItem('topo-graph');
            if (data && Graph.deserialize(data)) {
                document.getElementById('toggle-directed').checked = Graph.isDirected();
                document.getElementById('toggle-weights').checked = Graph.getUseWeights();
                UI.render();
                UI.showFeedback('📂', 'Netzwerk geladen!');
                Gamification.check();
            } else {
                UI.showFeedback('⚠️', 'Kein gespeichertes Netzwerk gefunden.');
            }
        });

        document.getElementById('btn-export').addEventListener('click', () => {
            const json = Graph.serialize();
            const blob = new Blob([json], { type: 'application/json' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'netzwerk-topologie.json';
            a.click();
            UI.showFeedback('📤', 'Netzwerk exportiert!');
        });

        document.getElementById('btn-import').addEventListener('click', () => {
            document.getElementById('import-file').click();
        });

        document.getElementById('import-file').addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                if (Graph.deserialize(ev.target.result)) {
                    document.getElementById('toggle-directed').checked = Graph.isDirected();
                    document.getElementById('toggle-weights').checked = Graph.getUseWeights();
                    UI.render();
                    UI.showFeedback('📥', 'Netzwerk importiert!');
                    Gamification.check();
                } else {
                    UI.showFeedback('❌', 'Ungültige Datei.');
                }
            };
            reader.readAsText(file);
            e.target.value = '';
        });

        // ── TASK PANEL ──────────────────────────────────────

        document.getElementById('btn-toggle-tasks').addEventListener('click', () => {
            document.getElementById('task-panel').classList.toggle('hidden');
        });

        document.getElementById('btn-close-tasks').addEventListener('click', () => {
            document.getElementById('task-panel').classList.add('hidden');
        });

        // ── LANGUAGE SWITCHER ───────────────────────────────

        document.querySelectorAll('.lang-flag').forEach(btn => {
            btn.addEventListener('click', () => {
                const lang = btn.dataset.lang;
                I18n.setLang(lang);
                UI.applyTranslations();
                UI.render();
                Gamification.renderTasks();
            });
        });

        // ── INFO BUTTONS (Mascot) ───────────────────────────

        document.querySelectorAll('.info-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                UI.openMascotPopup(btn.dataset.info);
            });
        });

        document.querySelectorAll('.info-btn-inline').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                UI.openMascotPopup(btn.dataset.info);
            });
        });

        // ── MASCOT POPUP CLOSE ──────────────────────────────

        document.getElementById('btn-close-mascot-popup').addEventListener('click', () => {
            UI.closeMascotPopup();
        });
        document.querySelector('.mascot-popup-backdrop').addEventListener('click', () => {
            UI.closeMascotPopup();
        });

        // ── Auto-save on changes ────────────────────────────
        const origRender = UI.render;
        const patchedRender = function () {
            origRender.call(UI);
            Gamification.check();
        };

        // Overwrite render to include gamification check
        // We use MutationObserver on SVG instead to avoid modifying the module
        setInterval(() => {
            Gamification.check();
        }, 2000);
    });

})();
