import { useRef, useEffect, useCallback, useState } from 'react';
import ForceGraph2D from 'react-force-graph-2d';

/**
 * MiniGraph component - renders an interactive knowledge graph
 * @param {Object} props
 * @param {Object} props.concept - Central concept
 * @param {Array} props.siblings - Sibling concepts
 * @param {Array} props.descendants - Descendant concepts
 * @param {Function} props.onNodeClick - Callback when a node is clicked
 */
export default function MiniGraph({ concept, siblings = [], descendants = [], onNodeClick }) {
    const graphRef = useRef();
    const containerRef = useRef();
    const [dimensions, setDimensions] = useState({ width: 350, height: 280 });

    // Build graph data
    const graphData = useCallback(() => {
        if (!concept) return { nodes: [], links: [] };

        const nodes = [];
        const links = [];
        const nodeIds = new Set();

        // Add central node
        nodes.push({
            id: concept.id,
            name: concept.name,
            type: 'central',
            val: 12
        });
        nodeIds.add(concept.id);

        // Add sibling nodes
        siblings.forEach(sib => {
            if (!nodeIds.has(sib.id)) {
                nodes.push({
                    id: sib.id,
                    name: sib.name,
                    type: 'sibling',
                    val: 6
                });
                nodeIds.add(sib.id);
                links.push({
                    source: concept.id,
                    target: sib.id,
                    type: 'sibling'
                });
            }
        });

        // Add descendant nodes
        descendants.forEach(desc => {
            if (!nodeIds.has(desc.id)) {
                nodes.push({
                    id: desc.id,
                    name: desc.name,
                    type: 'descendant',
                    val: 5
                });
                nodeIds.add(desc.id);
                links.push({
                    source: concept.id,
                    target: desc.id,
                    type: 'descendant'
                });
            }
        });

        // Add ambiguous_with nodes
        if (concept.ambiguous_with && concept.ambiguous_with.length > 0) {
            concept.ambiguous_with.forEach(ambId => {
                if (!nodeIds.has(ambId)) {
                    nodes.push({
                        id: ambId,
                        name: `Ambiguous (${ambId.slice(0, 6)}...)`,
                        type: 'ambiguous',
                        val: 5
                    });
                    nodeIds.add(ambId);
                    links.push({
                        source: concept.id,
                        target: ambId,
                        type: 'ambiguous'
                    });
                }
            });
        }

        return { nodes, links };
    }, [concept, siblings, descendants]);

    // Update dimensions when container resizes
    useEffect(() => {
        if (containerRef.current) {
            const { width, height } = containerRef.current.getBoundingClientRect();
            if (width > 0 && height > 0) {
                setDimensions({ width, height });
            }
        }
    }, []);

    // Center graph on load
    useEffect(() => {
        if (graphRef.current) {
            setTimeout(() => {
                graphRef.current.zoomToFit(400, 30);
            }, 100);
        }
    }, [concept]);

    const getNodeColor = (node) => {
        switch (node.type) {
            case 'central': return '#6366f1';
            case 'sibling': return '#3b82f6';
            case 'descendant': return '#10b981';
            case 'ambiguous': return '#f59e0b';
            default: return '#6b7280';
        }
    };

    const getLinkColor = (link) => {
        switch (link.type) {
            case 'sibling': return 'rgba(59, 130, 246, 0.5)';
            case 'descendant': return 'rgba(16, 185, 129, 0.5)';
            case 'ambiguous': return 'rgba(245, 158, 11, 0.5)';
            default: return 'rgba(107, 114, 128, 0.5)';
        }
    };

    const handleNodeClick = (node) => {
        if (onNodeClick && node.id !== concept?.id) {
            onNodeClick(node.id, node.name);
        }
    };

    const data = graphData();

    if (!concept || data.nodes.length === 0) {
        return (
            <div className="mini-graph-container" ref={containerRef}>
                <div className="mini-graph-empty">No graph data available</div>
            </div>
        );
    }

    return (
        <div className="mini-graph-container" ref={containerRef}>
            <div className="graph-legend">
                <span className="legend-item"><span className="dot central"></span> Current</span>
                <span className="legend-item"><span className="dot sibling"></span> Sibling</span>
                <span className="legend-item"><span className="dot descendant"></span> Descendant</span>
                {concept.ambiguous_with?.length > 0 && (
                    <span className="legend-item"><span className="dot ambiguous"></span> Ambiguous</span>
                )}
            </div>
            <ForceGraph2D
                ref={graphRef}
                graphData={data}
                width={dimensions.width}
                height={dimensions.height - 30}
                nodeLabel="name"
                nodeColor={getNodeColor}
                linkColor={getLinkColor}
                linkWidth={2}
                nodeRelSize={4}
                onNodeClick={handleNodeClick}
                cooldownTicks={50}
                d3AlphaDecay={0.05}
                d3VelocityDecay={0.3}
                nodeCanvasObject={(node, ctx, globalScale) => {
                    const label = node.name;
                    const fontSize = 10 / globalScale;
                    ctx.font = `${fontSize}px Inter, sans-serif`;

                    // Draw node circle
                    ctx.beginPath();
                    ctx.arc(node.x, node.y, node.val / globalScale, 0, 2 * Math.PI);
                    ctx.fillStyle = getNodeColor(node);
                    ctx.fill();

                    // Draw label
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'top';
                    ctx.fillStyle = '#1f2937';

                    // Truncate long labels
                    const maxLen = 15;
                    const displayLabel = label.length > maxLen
                        ? label.slice(0, maxLen) + '...'
                        : label;
                    ctx.fillText(displayLabel, node.x, node.y + (node.val / globalScale) + 2);
                }}
                nodePointerAreaPaint={(node, color, ctx, globalScale) => {
                    ctx.beginPath();
                    ctx.arc(node.x, node.y, node.val / globalScale + 5, 0, 2 * Math.PI);
                    ctx.fillStyle = color;
                    ctx.fill();
                }}
            />
        </div>
    );
}
