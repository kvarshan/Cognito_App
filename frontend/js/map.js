/* ==========================================================================
   COGNITO DOCUMENT MAP - High Performance HTML5 Canvas Visualizer
   ========================================================================== */

class DocumentMap {
    constructor(canvasId, tooltipId, onNodeClickCallback) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.tooltip = document.getElementById(tooltipId);
        this.onNodeClick = onNodeClickCallback;

        // Visual properties
        this.colors = [
            '#6366f1', // Indigo
            '#06b6d4', // Cyan
            '#8b5cf6', // Violet
            '#10b981', // Emerald
            '#f59e0b', // Amber
            '#ec4899', // Pink
            '#f43f5e', // Rose
            '#14b8a6'  // Teal
        ];
        
        this.nodes = [];
        this.selectedNode = null;
        this.hoveredNode = null;

        // Pan and Zoom Camera state
        this.zoom = 1.0;
        this.panX = 0.0;
        this.panY = 0.0;
        this.isDragging = false;
        this.startX = 0;
        this.startY = 0;

        // Node render configuration
        this.nodeRadius = 7;
        this.hoverRadius = 11;

        // Initialize Canvas Listeners
        this._initListeners();
        this.resize();
    }

    setNodes(nodesList) {
        // Formulate coordinates
        this.nodes = nodesList.map(node => {
            return {
                id: node.id,
                filename: node.filename,
                filepath: node.filepath,
                filetype: node.filetype,
                filesize: node.filesize,
                cluster_id: node.cluster_id ?? 0,
                cluster_name: node.cluster_name ?? "General Archive",
                x: node.x_coord ?? 0.0,
                y: node.y_coord ?? 0.0
            };
        });
        
        this.recenter();
        this.draw();
    }

    resize() {
        const rect = this.canvas.parentElement.getBoundingClientRect();
        this.canvas.width = rect.width;
        this.canvas.height = rect.height;
        this.draw();
    }

    recenter() {
        this.zoom = 1.0;
        this.panX = this.canvas.width / 2;
        this.panY = this.canvas.height / 2;
        this.draw();
    }

    // Convert canvas screen space to cartesian graph coordinates
    screenToWorld(sx, sy) {
        return {
            x: (sx - this.panX) / this.zoom,
            y: (sy - this.panY) / this.zoom
        };
    }

    // Convert cartesian coordinates to canvas screen space
    worldToScreen(wx, wy) {
        return {
            x: wx * this.zoom + this.panX,
            y: wy * this.zoom + this.panY
        };
    }

    _initListeners() {
        // Resize Handler
        window.addEventListener('resize', () => this.resize());

        // Mouse Drag Panning
        this.canvas.addEventListener('mousedown', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;
            
            // Check if clicking a node
            const clickedNode = this._getNodeAt(mouseX, mouseY);
            if (clickedNode) {
                if (this.onNodeClick) this.onNodeClick(clickedNode.id);
                return;
            }

            this.isDragging = true;
            this.startX = e.clientX - this.panX;
            this.startY = e.clientY - this.panY;
            this.canvas.style.cursor = 'grabbing';
        });

        window.addEventListener('mousemove', (e) => {
            if (this.isDragging) {
                this.panX = e.clientX - this.startX;
                this.panY = e.clientY - this.startY;
                this.draw();
                return;
            }

            // Mouse hover handling
            const rect = this.canvas.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;
            
            const node = this._getNodeAt(mouseX, mouseY);
            
            if (node !== this.hoveredNode) {
                this.hoveredNode = node;
                this._updateTooltip(node, e.clientX, e.clientY);
                this.draw();
            } else if (node) {
                // If still hovering, update tooltip position
                this._updateTooltip(node, e.clientX, e.clientY);
            }
        });

        window.addEventListener('mouseup', () => {
            if (this.isDragging) {
                this.isDragging = false;
                this.canvas.style.cursor = 'grab';
            }
        });

        // Zoom Handling (bounded between 0.2x and 8.0x)
        this.canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            const rect = this.canvas.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;

            // Zoom relative to mouse position
            const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
            const newZoom = Math.min(Math.max(0.2, this.zoom * zoomFactor), 8.0);
            
            // Re-pan so that the mouse point stays fixed during zoom
            const worldPos = this.screenToWorld(mouseX, mouseY);
            this.zoom = newZoom;
            this.panX = mouseX - worldPos.x * this.zoom;
            this.panY = mouseY - worldPos.y * this.zoom;

            this.draw();
        }, { passive: false });
    }

    _getNodeAt(sx, sy) {
        const worldPos = this.screenToWorld(sx, sy);
        
        for (const node of this.nodes) {
            const dx = node.x - worldPos.x;
            const dy = node.y - worldPos.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            
            // Account for zoom in detection threshold
            if (dist * this.zoom <= this.hoverRadius + 2) {
                return node;
            }
        }
        return null;
    }

    _updateTooltip(node, clientX, clientY) {
        if (!node) {
            this.tooltip.classList.add('hidden');
            return;
        }

        const sizeKb = (node.filesize / 1024).toFixed(1);
        
        document.getElementById('tooltip-title').innerText = node.filename;
        document.getElementById('tooltip-cluster').innerText = node.cluster_name;
        document.getElementById('tooltip-meta').innerText = `${node.filetype} • ${sizeKb} KB`;

        // Style the border matching the cluster color
        const color = this.colors[node.cluster_id % this.colors.length];
        this.tooltip.style.borderColor = color;

        // Position tooltip near cursor
        this.tooltip.style.left = `${clientX + 15}px`;
        this.tooltip.style.top = `${clientY + 15}px`;
        this.tooltip.classList.remove('hidden');
    }

    highlightCluster(clusterId) {
        this.selectedClusterId = clusterId === "" ? null : parseInt(clusterId);
        this.draw();
    }

    draw() {
        // Clear screen with canvas background
        this.ctx.fillStyle = '#020305';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        if (this.nodes.length === 0) {
            this.ctx.fillStyle = '#64748b';
            this.ctx.font = '14px Inter, sans-serif';
            this.ctx.textAlign = 'center';
            this.ctx.fillText("Train the local model to visualize documents.", this.canvas.width / 2, this.canvas.height / 2);
            return;
        }

        // Draw connections inside clusters (semantic density lines)
        this._drawConnections();

        // Draw nodes
        this._drawNodes();
    }

    _drawConnections() {
        this.ctx.lineWidth = 1.0;
        
        // Group by cluster
        const clusters = {};
        for (const node of this.nodes) {
            if (!clusters[node.cluster_id]) {
                clusters[node.cluster_id] = [];
            }
            clusters[node.cluster_id].push(node);
        }

        for (const clusterId in clusters) {
            const clusterNodes = clusters[clusterId];
            const color = this.colors[parseInt(clusterId) % this.colors.length];
            
            // Faint glow lines connecting everything in cluster
            this.ctx.strokeStyle = color;
            
            // Draw lines between near neighbors within the cluster
            for (let i = 0; i < clusterNodes.length; i++) {
                for (let j = i + 1; j < clusterNodes.length; j++) {
                    const n1 = clusterNodes[i];
                    const n2 = clusterNodes[j];
                    
                    const dx = n1.x - n2.x;
                    const dy = n1.y - n2.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    
                    // Only connect points within reasonable proximity
                    if (dist < 100) {
                        const p1 = this.worldToScreen(n1.x, n1.y);
                        const p2 = this.worldToScreen(n2.x, n2.y);
                        
                        // Fading opacity based on distance and highlight status
                        let opacity = 0.08 * (1 - dist / 100);
                        if (this.selectedClusterId !== undefined && this.selectedClusterId !== null) {
                            if (parseInt(clusterId) !== this.selectedClusterId) {
                                opacity *= 0.15; // Fade out unselected clusters
                            } else {
                                opacity *= 2.0; // Boost selected cluster connections
                            }
                        }
                        
                        this.ctx.globalAlpha = opacity;
                        this.ctx.beginPath();
                        this.ctx.moveTo(p1.x, p1.y);
                        this.ctx.lineTo(p2.x, p2.y);
                        this.ctx.stroke();
                    }
                }
            }
        }
        this.ctx.globalAlpha = 1.0; // Reset
    }

    _drawNodes() {
        for (const node of this.nodes) {
            const color = this.colors[node.cluster_id % this.colors.length];
            const pos = this.worldToScreen(node.x, node.y);
            
            const isHovered = (this.hoveredNode && this.hoveredNode.id === node.id);
            const isClusterHighlighted = (this.selectedClusterId === undefined || this.selectedClusterId === null || node.cluster_id === this.selectedClusterId);
            
            // Opacity states
            let opacity = 1.0;
            if (!isClusterHighlighted) {
                opacity = 0.2;
            }
            
            this.ctx.globalAlpha = opacity;
            
            // Draw glow shadow
            if (isHovered) {
                const grad = this.ctx.createRadialGradient(pos.x, pos.y, 1, pos.x, pos.y, this.hoverRadius * 2.2);
                grad.addColorStop(0, color);
                grad.addColorStop(0.3, color + '55'); // Semi-trans
                grad.addColorStop(1, 'transparent');
                
                this.ctx.fillStyle = grad;
                this.ctx.beginPath();
                this.ctx.arc(pos.x, pos.y, this.hoverRadius * 2.2, 0, Math.PI * 2);
                this.ctx.fill();
            } else {
                // Faint static glow shadow
                const grad = this.ctx.createRadialGradient(pos.x, pos.y, 1, pos.x, pos.y, this.nodeRadius * 2.0);
                grad.addColorStop(0, color + 'aa');
                grad.addColorStop(1, 'transparent');
                
                this.ctx.fillStyle = grad;
                this.ctx.beginPath();
                this.ctx.arc(pos.x, pos.y, this.nodeRadius * 2.0, 0, Math.PI * 2);
                this.ctx.fill();
            }
            
            // Draw outer border ring
            this.ctx.strokeStyle = '#ffffff';
            this.ctx.lineWidth = isHovered ? 2.5 : 1.5;
            this.ctx.beginPath();
            this.ctx.arc(pos.x, pos.y, isHovered ? this.hoverRadius : this.nodeRadius, 0, Math.PI * 2);
            this.ctx.stroke();

            // Draw core colored circle
            this.ctx.fillStyle = color;
            this.ctx.beginPath();
            this.ctx.arc(pos.x, pos.y, isHovered ? this.hoverRadius - 2 : this.nodeRadius - 1.5, 0, Math.PI * 2);
            this.ctx.fill();
            
            // Draw text tag for hover node
            if (isHovered && this.zoom >= 0.5) {
                this.ctx.fillStyle = '#ffffff';
                this.ctx.font = 'bold 12px Inter, sans-serif';
                this.ctx.textAlign = 'center';
                this.ctx.shadowColor = '#000000';
                this.ctx.shadowBlur = 4;
                this.ctx.fillText(node.filename, pos.x, pos.y - 18);
                this.ctx.shadowBlur = 0; // Reset
            }
        }
        
        this.ctx.globalAlpha = 1.0; // Reset
    }
}
