/* ============================================================
   graph.js – Graphdatenstruktur & Analyse-Engine
   ============================================================
   Verwaltet Knoten, Kanten (als Adjazenzliste) und
   bietet sämtliche Analysefunktionen.
   Unterstützt gerichtete/ungerichtete Graphen & Kantengewichte.
   ============================================================ */

const Graph = (() => {
    'use strict';

    // ── Datenstrukturen ──────────────────────────────────────
    /** adjacency: { "A": ["B","C"], "B": ["A"], … } */
    let adjacency = {};

    /** positions: { "A": {x, y}, … } */
    let positions = {};

    /** Kantengewichte: { "A-B": 3, … } (key immer sortiert für ungerichtet) */
    let weights = {};

    /** Gerichtete Kanten-Daten: { "A>B": true, … } */
    let directedEdges = {};

    /** Deaktivierte Kanten (Ausfallsimulation) – Set von "A-B" (sortiert) */
    let disabledEdges = new Set();

    /** Knotenfärbung: { "A": 0, "B": 1, … } */
    let nodeColors = {};

    /** Nächste node-ID (alphabetisch) */
    let nextId = 0;

    /** Modus-Flags */
    let directed = false;
    let useWeights = false;

    // ── Hilfsfunktionen ──────────────────────────────────────

    function idFromIndex(index) {
        let s = '';
        let n = index;
        do {
            s = String.fromCharCode(65 + (n % 26)) + s;
            n = Math.floor(n / 26) - 1;
        } while (n >= 0);
        return s;
    }

    /** Sortierter Kanten-Key (ungerichtet) */
    function edgeKey(a, b) {
        return [a, b].sort().join('-');
    }

    /** Gerichteter Kanten-Key */
    function dirEdgeKey(a, b) {
        return a + '>' + b;
    }

    function setDirected(val) { directed = !!val; }
    function isDirected() { return directed; }
    function setUseWeights(val) { useWeights = !!val; }
    function getUseWeights() { return useWeights; }

    // ── Knoten ───────────────────────────────────────────────

    function addNode(x, y) {
        const id = idFromIndex(nextId++);
        adjacency[id] = [];
        positions[id] = { x, y };
        return id;
    }

    function removeNode(id) {
        if (!(id in adjacency)) return;
        const neighbors = [...adjacency[id]];
        neighbors.forEach(nb => {
            adjacency[nb] = adjacency[nb].filter(n => n !== id);
            disabledEdges.delete(edgeKey(id, nb));
            delete weights[edgeKey(id, nb)];
            delete directedEdges[dirEdgeKey(id, nb)];
            delete directedEdges[dirEdgeKey(nb, id)];
        });
        delete adjacency[id];
        delete positions[id];
        delete nodeColors[id];
    }

    function getNodes() { return Object.keys(adjacency).sort(); }
    function getNodePosition(id) { return positions[id] || null; }
    function setNodePosition(id, x, y) {
        if (positions[id]) { positions[id].x = x; positions[id].y = y; }
    }

    // ── Kanten ───────────────────────────────────────────────

    function addEdge(a, b, weight) {
        if (a === b) return false;
        if (!(a in adjacency) || !(b in adjacency)) return false;

        if (directed) {
            // Gerichtet: A→B
            if (adjacency[a].includes(b)) {
                // Prüfe ob gerichtete Kante schon existiert
                if (directedEdges[dirEdgeKey(a, b)]) return false;
            }
            if (!adjacency[a].includes(b)) adjacency[a].push(b);
            if (!adjacency[b].includes(a)) adjacency[b].push(a);
            directedEdges[dirEdgeKey(a, b)] = true;
        } else {
            if (adjacency[a].includes(b)) return false;
            adjacency[a].push(b);
            adjacency[b].push(a);
        }

        if (weight !== undefined) {
            weights[edgeKey(a, b)] = weight;
        }

        return true;
    }

    function removeEdge(a, b) {
        if (!(a in adjacency) || !(b in adjacency)) return;

        if (directed) {
            delete directedEdges[dirEdgeKey(a, b)];
            delete directedEdges[dirEdgeKey(b, a)];
        }

        adjacency[a] = adjacency[a].filter(n => n !== b);
        adjacency[b] = adjacency[b].filter(n => n !== a);
        disabledEdges.delete(edgeKey(a, b));
        delete weights[edgeKey(a, b)];
    }

    function getEdges() {
        const seen = new Set();
        const edges = [];
        for (const u of Object.keys(adjacency)) {
            for (const v of adjacency[u]) {
                if (directed) {
                    // Return directed edges
                    const dk = dirEdgeKey(u, v);
                    if (directedEdges[dk] && !seen.has(dk)) {
                        seen.add(dk);
                        edges.push([u, v]);
                    }
                } else {
                    const k = edgeKey(u, v);
                    if (!seen.has(k)) { seen.add(k); edges.push([u, v]); }
                }
            }
        }
        return edges;
    }

    function hasEdge(a, b) {
        if (directed) {
            return !!directedEdges[dirEdgeKey(a, b)];
        }
        return adjacency[a] && adjacency[a].includes(b);
    }

    function getEdgeWeight(a, b) {
        return weights[edgeKey(a, b)] || 1;
    }

    function setEdgeWeight(a, b, w) {
        weights[edgeKey(a, b)] = w;
    }

    /** Liefert Nachbarn, die über ausgehende Kanten erreichbar sind */
    function getOutNeighbors(u) {
        if (!adjacency[u]) return [];
        if (!directed) return adjacency[u];
        return adjacency[u].filter(v => directedEdges[dirEdgeKey(u, v)]);
    }

    // ── Ausfall ──────────────────────────────────────────────

    function toggleEdgeDisabled(a, b) {
        const k = edgeKey(a, b);
        if (disabledEdges.has(k)) { disabledEdges.delete(k); return false; }
        disabledEdges.add(k); return true;
    }

    function isEdgeDisabled(a, b) {
        return disabledEdges.has(edgeKey(a, b));
    }

    function resetFailures() { disabledEdges.clear(); }

    /** Aktive Adjazenz (ohne deaktivierte Kanten) */
    function activeAdjacency() {
        const adj = {};
        for (const u of Object.keys(adjacency)) { adj[u] = []; }
        for (const u of Object.keys(adjacency)) {
            for (const v of adjacency[u]) {
                if (!disabledEdges.has(edgeKey(u, v))) {
                    if (directed) {
                        if (directedEdges[dirEdgeKey(u, v)] && !adj[u].includes(v)) {
                            adj[u].push(v);
                        }
                    } else {
                        if (!adj[u].includes(v)) adj[u].push(v);
                    }
                }
            }
        }
        return adj;
    }

    // ── Färbung ──────────────────────────────────────────────

    function greedyColoring() {
        const nodes = getNodes();
        nodeColors = {};
        nodes.forEach(u => {
            const usedColors = new Set();
            (adjacency[u] || []).forEach(v => {
                if (nodeColors[v] !== undefined) usedColors.add(nodeColors[v]);
            });
            let c = 0;
            while (usedColors.has(c)) c++;
            nodeColors[u] = c;
        });
        return nodeColors;
    }

    function getNodeColors() { return { ...nodeColors }; }
    function resetColors() { nodeColors = {}; }
    function chromaticNumber() {
        if (Object.keys(nodeColors).length === 0) return 0;
        return Math.max(...Object.values(nodeColors)) + 1;
    }

    // ── Reset ────────────────────────────────────────────────

    function reset() {
        adjacency = {};
        positions = {};
        weights = {};
        directedEdges = {};
        disabledEdges.clear();
        nodeColors = {};
        nextId = 0;
    }

    // ── Statistiken ──────────────────────────────────────────

    function nodeCount() { return Object.keys(adjacency).length; }
    function edgeCount() { return getEdges().length; }
    function degree(id) { return adjacency[id] ? adjacency[id].length : 0; }
    function degrees() {
        const d = {};
        for (const id of Object.keys(adjacency)) { d[id] = adjacency[id].length; }
        return d;
    }

    /** In-degree / Out-degree für gerichtete Graphen */
    function inOutDegrees() {
        const result = {};
        const nodes = Object.keys(adjacency);
        nodes.forEach(u => { result[u] = { in: 0, out: 0 }; });
        for (const u of nodes) {
            for (const v of adjacency[u]) {
                if (directedEdges[dirEdgeKey(u, v)]) {
                    result[u].out++;
                    result[v].in++;
                }
            }
        }
        return result;
    }

    // ── BFS ──────────────────────────────────────────────────

    function bfs(start, adj) {
        adj = adj || adjacency;
        const visited = new Set();
        const parent = {};
        const order = [];
        const queue = [start];
        visited.add(start);
        parent[start] = null;
        while (queue.length) {
            const u = queue.shift();
            order.push(u);
            for (const v of (adj[u] || [])) {
                if (!visited.has(v)) {
                    visited.add(v);
                    parent[v] = u;
                    queue.push(v);
                }
            }
        }
        return { visited, parent, order };
    }

    // ── DFS ──────────────────────────────────────────────────

    function dfs(start, adj) {
        adj = adj || adjacency;
        const visited = new Set();
        const parent = {};
        const order = [];
        parent[start] = null;

        function visit(u) {
            visited.add(u);
            order.push(u);
            for (const v of (adj[u] || [])) {
                if (!visited.has(v)) {
                    parent[v] = u;
                    visit(v);
                }
            }
        }
        visit(start);
        return { visited, parent, order };
    }

    // ── Zusammenhang ─────────────────────────────────────────

    function isConnected(adj) {
        adj = adj || adjacency;
        const nodes = Object.keys(adj);
        if (nodes.length <= 1) return true;
        // Für gerichtete Graphen: schwacher Zusammenhang (ignoriere Richtung)
        const undirAdj = {};
        for (const u of nodes) { undirAdj[u] = []; }
        for (const u of nodes) {
            for (const v of (adj[u] || [])) {
                if (!undirAdj[u].includes(v)) undirAdj[u].push(v);
                if (!undirAdj[v].includes(u)) undirAdj[v].push(u);
            }
        }
        const { visited } = bfs(nodes[0], undirAdj);
        return visited.size === nodes.length;
    }

    // ── Zyklen ───────────────────────────────────────────────

    function hasCycle() {
        const nodes = Object.keys(adjacency);
        const visited = new Set();
        if (directed) {
            // Gerichtet: Zyklen via DFS mit Farben
            const gray = new Set(), black = new Set();
            function dfsDir(u) {
                gray.add(u);
                for (const v of getOutNeighbors(u)) {
                    if (gray.has(v)) return true;
                    if (!black.has(v)) {
                        if (dfsDir(v)) return true;
                    }
                }
                gray.delete(u);
                black.add(u);
                return false;
            }
            for (const n of nodes) {
                if (!black.has(n) && !gray.has(n)) {
                    if (dfsDir(n)) return true;
                }
            }
            return false;
        } else {
            function dfsUndir(u, parent) {
                visited.add(u);
                for (const v of adjacency[u]) {
                    if (!visited.has(v)) {
                        if (dfsUndir(v, u)) return true;
                    } else if (v !== parent) {
                        return true;
                    }
                }
                return false;
            }
            for (const n of nodes) {
                if (!visited.has(n)) {
                    if (dfsUndir(n, null)) return true;
                }
            }
            return false;
        }
    }

    // ── Vollständiger Graph ──────────────────────────────────

    function isComplete() {
        const n = nodeCount();
        if (n < 2) return false;
        if (directed) {
            return edgeCount() === n * (n - 1);
        }
        return edgeCount() === (n * (n - 1)) / 2;
    }

    // ── Baum ─────────────────────────────────────────────────

    function isTree() {
        const n = nodeCount();
        if (n === 0) return false;
        if (directed) return false; // Bäume nur für ungerichtet
        return isConnected() && edgeCount() === n - 1;
    }

    // ── Bridge Detection (Tarjan) ────────────────────────────

    function findBridges() {
        if (directed) return []; // Nur für ungerichtete Graphen
        const nodes = Object.keys(adjacency);
        const disc = {}, low = {};
        const bridges = [];
        let timer = 0;

        function dfsB(u, parent) {
            disc[u] = low[u] = timer++;
            for (const v of adjacency[u]) {
                if (disc[v] === undefined) {
                    dfsB(v, u);
                    low[u] = Math.min(low[u], low[v]);
                    if (low[v] > disc[u]) bridges.push([u, v]);
                } else if (v !== parent) {
                    low[u] = Math.min(low[u], disc[v]);
                }
            }
        }
        for (const n of nodes) {
            if (disc[n] === undefined) dfsB(n, null);
        }
        return bridges;
    }

    // ── Artikulationsknoten ──────────────────────────────────

    function findArticulationPoints() {
        if (directed) return [];
        const nodes = Object.keys(adjacency);
        const disc = {}, low = {};
        const ap = new Set();
        let timer = 0;

        function dfsAP(u, parent) {
            disc[u] = low[u] = timer++;
            let children = 0;
            for (const v of adjacency[u]) {
                if (disc[v] === undefined) {
                    children++;
                    dfsAP(v, u);
                    low[u] = Math.min(low[u], low[v]);
                    if (parent === null && children > 1) ap.add(u);
                    if (parent !== null && low[v] >= disc[u]) ap.add(u);
                } else if (v !== parent) {
                    low[u] = Math.min(low[u], disc[v]);
                }
            }
        }
        for (const n of nodes) {
            if (disc[n] === undefined) dfsAP(n, null);
        }
        return [...ap];
    }

    // ── Redundanz-Metrik ─────────────────────────────────────

    function redundancy() {
        const n = nodeCount();
        const m = edgeCount();
        if (n < 3) return 0;
        const minEdges = n - 1;
        const maxEdges = directed ? n * (n - 1) : (n * (n - 1)) / 2;
        if (maxEdges === minEdges) return 0;
        const r = (m - minEdges) / (maxEdges - minEdges);
        return Math.max(0, Math.min(1, r));
    }

    // ── Topologie-Erkennung ──────────────────────────────────

    function detectTopology() {
        const n = nodeCount();
        const m = edgeCount();
        if (n === 0) return 'leer';
        if (n === 1) return 'einzelknoten';
        if (!isConnected()) return 'nicht zusammenhängend';
        if (directed) return 'gerichteter graph'; // Topologie nur für ungerichtet

        const degs = Object.values(degrees());

        if (isComplete()) return 'vollvermascht';
        if (degs.every(d => d === 2) && m === n) return 'ring';
        if (n >= 3) {
            const hub = degs.filter(d => d === n - 1).length;
            const leaves = degs.filter(d => d === 1).length;
            if (hub === 1 && leaves === n - 1) return 'stern';
        }
        if (m === n - 1) {
            const deg1 = degs.filter(d => d === 1).length;
            const deg2 = degs.filter(d => d === 2).length;
            if (deg1 === 2 && deg2 === n - 2) return 'linie';
        }
        if (isTree()) return 'baum';
        if (hasCycle() && !isComplete()) return 'teilvermascht';

        return 'unbekannt';
    }

    const TOPOLOGY_INFO = {
        'leer': { name: 'Leer', definition: 'Kein Netzwerk vorhanden.', usage: '—', cable: '—', redundancy: '—', pros: '—', cons: '—' },
        'einzelknoten': { name: 'Einzelknoten', definition: 'Ein einzelner Knoten ohne Verbindungen.', usage: 'Einzelgerät', cable: '0', redundancy: 'Keine', pros: 'Einfach', cons: 'Keine Kommunikation möglich' },
        'nicht zusammenhängend': { name: 'Nicht zusammenhängend', definition: 'Das Netzwerk besteht aus mehreren getrennten Teilen. Nicht alle Geräte können miteinander kommunizieren.', usage: 'Fehlerhaft / getrennte Subnetze', cable: '—', redundancy: 'Keine vollständige Erreichbarkeit', pros: 'Isolation von Bereichen', cons: 'Keine vollständige Kommunikation' },
        'gerichteter graph': { name: 'Gerichteter Graph', definition: 'Ein Graph mit gerichteten Kanten (Pfeile). Die Verbindung ist nur in eine Richtung möglich.', usage: 'Internet-Routing, Einbahnstraßen, Abhängigkeitsgraphen', cable: 'Variabel', redundancy: 'Abhängig von der Struktur', pros: 'Modelliert reale Einweg-Verbindungen', cons: 'Komplexere Analyse als ungerichtete Graphen' },
        'linie': {
            name: 'Linie (Bus)',
            definition: 'Alle Knoten sind in einer Reihe hintereinander verbunden. Jeder Knoten hat maximal zwei Nachbarn. Die Bus-Topologie ist die einfachste Form eines Netzwerks.',
            usage: 'Einfache serielle Verkabelung, frühe Ethernet-Netzwerke (10BASE2, Koaxialkabel). Heute noch bei CAN-Bus (Automobiltechnik).',
            cable: 'n − 1 Kabel – der minimal mögliche Aufwand für ein zusammenhängendes Netz.',
            redundancy: 'Keine Redundanz – ein einziger Kabelbruch trennt das gesamte Netzwerk in zwei Teile.',
            pros: 'Minimaler Kabelaufwand; einfach aufzubauen und zu verstehen; kostengünstig für kleine Netze.',
            cons: 'Sehr anfällig für Ausfälle; keine alternativen Pfade; Erweiterungen erfordern Änderung der gesamten Leitung; begrenzte Netzwerkgröße.'
        },
        'ring': {
            name: 'Ring',
            definition: 'Jeder Knoten ist mit genau zwei Nachbarn verbunden und bildet einen geschlossenen Kreis. Daten werden von Knoten zu Knoten weitergereicht, bis sie das Ziel erreichen.',
            usage: 'Token Ring (IEEE 802.5), FDDI (Glasfaser-Backbone), Metro-Ethernet-Ringe, SDH/SONET-Ringe in der Telekommunikation.',
            cable: 'Genau n Kabel – ein Kabel mehr als bei der Linie, dafür einen geschlossenen Kreis.',
            redundancy: 'Begrenzte Redundanz – bei einem einfachen Ring führt ein Ausfall zur Unterbrechung. Doppelringe (FDDI) bieten deutlich bessere Ausfallsicherheit.',
            pros: 'Gleichmäßige Lastverteilung; kein zentraler Knoten als Single Point of Failure; deterministische Zugriffssteuerung (Token).',
            cons: 'Ein einzelner Ausfall kann den gesamten Ring unterbrechen; Latenz steigt mit der Knotenanzahl; Störungssuche ist aufwändig.'
        },
        'stern': {
            name: 'Stern',
            definition: 'Alle Endgeräte sind mit einem zentralen Knoten (Hub, Switch oder Router) verbunden. Es gibt keine direkten Verbindungen zwischen Endgeräten.',
            usage: 'Das mit Abstand häufigste LAN-Layout (Ethernet mit Switch). Fast jedes moderne Büronetzwerk nutzt eine Stern-Topologie.',
            cable: 'n − 1 Kabel – vom zentralen Knoten zu jedem Endgerät eine eigene Leitung.',
            redundancy: 'Keine Redundanz – der zentrale Knoten ist ein Single Point of Failure. Fällt er aus, ist das gesamte Netz getrennt.',
            pros: 'Einfache Erweiterung durch Hinzufügen neuer Kabel zum Hub; Ausfall eines Endgeräts betrifft nicht die anderen; einfache Fehlersuche.',
            cons: 'Zentraler Knoten als kritischer Punkt; höherer Kabelaufwand als bei Bus; Leistungsfähigkeit hängt vom Hub/Switch ab.'
        },
        'baum': {
            name: 'Baum',
            definition: 'Hierarchische Struktur ohne Zyklen. Der Graph ist zusammenhängend und besitzt genau n−1 Kanten. Kann als Erweiterung der Stern-Topologie betrachtet werden.',
            usage: 'Hierarchische Netzwerke in Unternehmen (Core-Distribution-Access), Spanning Trees, Active Directory-Strukturen.',
            cable: 'n − 1 Kabel – das absolute Minimum für ein zusammenhängendes Netz.',
            redundancy: 'Keine Redundanz – jede einzelne Kante ist eine Bridge (kritische Kante). Jeder Ausfall trennt Teilbäume.',
            pros: 'Effizient; logische Hierarchie; minimaler Kabelaufwand; gut skalierbar in die Tiefe.',
            cons: 'Jeder Kantenausfall trennt Teilbereiche sofort; Root-Knoten wird bei wachsendem Netz zum Flaschenhals.'
        },
        'vollvermascht': {
            name: 'Voll vermascht (Full Mesh)',
            definition: 'Jeder Knoten ist direkt mit jedem anderen Knoten verbunden. Dies ist die Topologie mit der maximal möglichen Anzahl an Verbindungen.',
            usage: 'Backbone-Netzwerke, kritische Infrastruktur (z.B. Rechenzentrumsverbindungen), kleine hochverfügbare Netze.',
            cable: 'n·(n−1)/2 Kabel – der maximal mögliche Aufwand. Bei 10 Knoten bereits 45 Kabel!',
            redundancy: 'Maximale Redundanz – es gibt immer einen direkten alternativen Weg. Selbst bei mehreren Ausfällen bleibt das Netz verbunden.',
            pros: 'Höchste Ausfallsicherheit; maximale Bandbreite durch direkte Verbindungen; keine Single Points of Failure.',
            cons: 'Extrem hoher Kabelaufwand; schlecht skalierbar (quadratisch wachsend); hohe Kosten; komplexe Verwaltung.'
        },
        'teilvermascht': {
            name: 'Teilvermascht (Partial Mesh)',
            definition: 'Einige, aber nicht alle Knoten sind direkt miteinander verbunden. Es gibt Zyklen (Redundanz), aber keine vollständige Vermaschung.',
            usage: 'WAN-Verbindungen, Internet, praktische Unternehmensnetzwerke. Die häufigste Topologie in realen großen Netzwerken.',
            cable: 'Zwischen n−1 (Baum) und n·(n−1)/2 (voll vermascht) – ein bewusster Kompromiss.',
            redundancy: 'Moderate Redundanz – einige alternative Pfade sind vorhanden, aber nicht zwischen allen Knotenpaaren.',
            pros: 'Guter Kompromiss zwischen Kosten und Ausfallsicherheit; flexibel planbar; gut skalierbar.',
            cons: 'Erfordert sorgfältige Planung, welche Knoten vermascht werden; ungleichmäßige Redundanz möglich.'
        },
        'unbekannt': { name: 'Unbekannt', definition: 'Die Topologie konnte nicht eindeutig zugeordnet werden.', usage: '—', cable: '—', redundancy: '—', pros: '—', cons: '—' }
    };

    function getTopologyInfo(key) {
        if (key) return { key, ...TOPOLOGY_INFO[key] };
        const k = detectTopology();
        return { key: k, ...TOPOLOGY_INFO[k] };
    }

    // ── Adjazenzmatrix ───────────────────────────────────────

    function getAdjacencyMatrix() {
        const nodes = getNodes();
        const n = nodes.length;
        const matrix = [];
        for (let i = 0; i < n; i++) {
            const row = [];
            for (let j = 0; j < n; j++) {
                if (directed) {
                    if (directedEdges[dirEdgeKey(nodes[i], nodes[j])]) {
                        row.push(useWeights ? getEdgeWeight(nodes[i], nodes[j]) : 1);
                    } else {
                        row.push(0);
                    }
                } else {
                    if (adjacency[nodes[i]] && adjacency[nodes[i]].includes(nodes[j])) {
                        row.push(useWeights ? getEdgeWeight(nodes[i], nodes[j]) : 1);
                    } else {
                        row.push(0);
                    }
                }
            }
            matrix.push(row);
        }
        return { nodes, matrix };
    }

    // ── Kürzester Pfad (BFS) ─────────────────────────────────

    function shortestPath(start, end, adj) {
        adj = adj || activeAdjacency();
        if (!(start in adj) || !(end in adj)) return null;
        const { visited, parent } = bfs(start, adj);
        if (!visited.has(end)) return null;
        const path = [];
        let cur = end;
        while (cur !== null) { path.unshift(cur); cur = parent[cur]; }
        return path;
    }

    function hasAlternativePath(start, end) {
        const adj = activeAdjacency();
        const path1 = shortestPath(start, end, adj);
        if (!path1 || path1.length < 2) return false;
        const adj2 = {};
        for (const u of Object.keys(adj)) { adj2[u] = [...adj[u]]; }
        for (let i = 0; i < path1.length - 1; i++) {
            const a = path1[i], b = path1[i + 1];
            adj2[a] = adj2[a].filter(n => n !== b);
            if (!directed) adj2[b] = adj2[b].filter(n => n !== a);
        }
        return shortestPath(start, end, adj2) !== null;
    }

    // ── BFS Flooding ─────────────────────────────────────────

    function bfsFlood(start) {
        const adj = activeAdjacency();
        const visited = new Set();
        const steps = [];
        const queue = [{ node: start, from: null }];
        visited.add(start);
        steps.push({ node: start, from: null });
        while (queue.length) {
            const { node } = queue.shift();
            for (const v of (adj[node] || [])) {
                if (!visited.has(v)) {
                    visited.add(v);
                    queue.push({ node: v, from: node });
                    steps.push({ node: v, from: node });
                }
            }
        }
        return steps;
    }

    // ── DFS Traversierung ────────────────────────────────────

    function dfsTraverse(start) {
        const adj = activeAdjacency();
        return dfs(start, adj);
    }

    function bfsTraverse(start) {
        const adj = activeAdjacency();
        return bfs(start, adj);
    }

    // ── Serialisierung ───────────────────────────────────────

    function serialize() {
        return JSON.stringify({
            adjacency, positions, nextId,
            disabled: [...disabledEdges],
            weights, directedEdges,
            directed, useWeights,
            nodeColors
        });
    }

    function deserialize(json) {
        try {
            const data = JSON.parse(json);
            adjacency = data.adjacency || {};
            positions = data.positions || {};
            nextId = data.nextId || Object.keys(adjacency).length;
            disabledEdges = new Set(data.disabled || []);
            weights = data.weights || {};
            directedEdges = data.directedEdges || {};
            directed = data.directed || false;
            useWeights = data.useWeights || false;
            nodeColors = data.nodeColors || {};
            return true;
        } catch { return false; }
    }

    // ── Öffentliche API ──────────────────────────────────────

    return {
        addNode, removeNode, getNodes, getNodePosition, setNodePosition,
        addEdge, removeEdge, getEdges, hasEdge, edgeKey, dirEdgeKey,
        getEdgeWeight, setEdgeWeight, getOutNeighbors,
        toggleEdgeDisabled, isEdgeDisabled, resetFailures, activeAdjacency,
        setDirected, isDirected, setUseWeights, getUseWeights,
        greedyColoring, getNodeColors, resetColors, chromaticNumber,
        reset,
        nodeCount, edgeCount, degree, degrees, inOutDegrees,
        bfs, dfs, isConnected, hasCycle, isComplete, isTree,
        findBridges, findArticulationPoints,
        redundancy, detectTopology, getTopologyInfo, TOPOLOGY_INFO,
        getAdjacencyMatrix,
        shortestPath, hasAlternativePath, bfsFlood,
        dfsTraverse, bfsTraverse,
        serialize, deserialize
    };
})();
