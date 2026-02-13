/* ============================================================
   simulation.js – Datenfluss-Simulation & Traversierung
   ============================================================ */

const Simulation = (() => {
    'use strict';

    let running = false;
    let timer = null;

    function stop() {
        running = false;
        if (timer) { clearTimeout(timer); timer = null; }
    }

    function isRunning() { return running; }

    // ── Pfad-Simulation (BFS) ────────────────────────────────

    function simulatePath(startId, endId, onStep, onEdge, onDone) {
        stop();
        const path = Graph.shortestPath(startId, endId);
        if (!path) { onDone(null); return; }
        running = true;
        let i = 0;

        function step() {
            if (!running) return;
            if (i < path.length) {
                onStep(path[i], i);
                if (i > 0) onEdge(path[i - 1], path[i]);
                i++;
                timer = setTimeout(step, 500);
            } else {
                running = false;
                onDone(path);
            }
        }
        step();
    }

    // ── Flooding (BFS) ──────────────────────────────────────

    function simulateFlood(startId, onStep, onDone) {
        stop();
        const steps = Graph.bfsFlood(startId);
        if (steps.length === 0) { onDone([]); return; }
        running = true;
        let i = 0;

        function step() {
            if (!running) return;
            if (i < steps.length) {
                onStep(steps[i].node, steps[i].from, i);
                i++;
                timer = setTimeout(step, 400);
            } else {
                running = false;
                onDone(steps);
            }
        }
        step();
    }

    // ── DFS Traversierung ───────────────────────────────────

    function simulateDFS(startId, onStep, onEdge, onDone) {
        stop();
        const result = Graph.dfsTraverse(startId);
        if (!result || result.order.length === 0) { onDone(null); return; }
        running = true;
        let i = 0;
        const order = result.order;
        const parent = result.parent;

        function step() {
            if (!running) return;
            if (i < order.length) {
                const node = order[i];
                onStep(node, i);
                if (parent[node] !== null && parent[node] !== undefined) {
                    onEdge(parent[node], node);
                }
                i++;
                timer = setTimeout(step, 500);
            } else {
                running = false;
                onDone(order);
            }
        }
        step();
    }

    // ── BFS Traversierung ───────────────────────────────────

    function simulateBFS(startId, onStep, onEdge, onDone) {
        stop();
        const result = Graph.bfsTraverse(startId);
        if (!result || result.order.length === 0) { onDone(null); return; }
        running = true;
        let i = 0;
        const order = result.order;
        const parent = result.parent;

        function step() {
            if (!running) return;
            if (i < order.length) {
                const node = order[i];
                onStep(node, i);
                if (parent[node] !== null && parent[node] !== undefined) {
                    onEdge(parent[node], node);
                }
                i++;
                timer = setTimeout(step, 400);
            } else {
                running = false;
                onDone(order);
            }
        }
        step();
    }

    return { simulatePath, simulateFlood, simulateDFS, simulateBFS, stop, isRunning };
})();
