import React, { useState, useEffect, useRef } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import {
  Share2,
  AlertTriangle,
  Building,
  CheckCircle,
  Eye,
  RefreshCw,
  Search,
  ExternalLink,
  Sliders,
  DollarSign,
  ArrowRight
} from 'lucide-react';
import { User, SupplierGraphData, GraphNode, GraphEdge } from '../types/auth';

interface SupplierGraphPageProps {
  currentUser: User;
  token: string;
  onNavigateToInvestigations?: () => void;
  onNavigateToScorecard?: (supplierId: string) => void;
}

export const SupplierGraphPage: React.FC<SupplierGraphPageProps> = ({
  token,
  onNavigateToInvestigations,
  onNavigateToScorecard
}) => {
  const [graphData, setGraphData] = useState<SupplierGraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<GraphEdge | null>(null);
  const [filterType, setFilterType] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Bank change modal state
  const [showBankModal, setShowBankModal] = useState(false);
  const [newBankInput, setNewBankInput] = useState('');
  const [bankChangeReason, setBankChangeReason] = useState('');
  const [bankSubmitting, setBankSubmitting] = useState(false);
  const [bankSuccessMsg, setBankSuccessMsg] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 500 });

  useEffect(() => {
    fetchGraph();
  }, []);

  useEffect(() => {
    function updateDimensions() {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.clientWidth || 800,
          height: Math.max(500, window.innerHeight - 320)
        });
      }
    }
    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  const fetchGraph = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/suppliers/graph', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        setGraphData(data);
      } else {
        throw new Error(data.message || 'Failed to load supplier graph');
      }
    } catch (err: any) {
      setError(err.message || 'Error communicating with backend service');
    } finally {
      setLoading(false);
    }
  };

  const handleRequestBankChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedNode || !newBankInput.trim()) return;

    setBankSubmitting(true);
    setBankSuccessMsg(null);
    setError(null);

    try {
      const res = await fetch(`/api/suppliers/${selectedNode.id}/bank`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          bank_identifier: newBankInput.trim(),
          reason: bankChangeReason.trim() || 'Vendor bank details update'
        })
      });
      const data = await res.json();
      if (res.ok) {
        setBankSuccessMsg(data.message || 'Bank change request created for Finance Manager authorization.');
        setTimeout(() => {
          setShowBankModal(false);
          setNewBankInput('');
          setBankChangeReason('');
          fetchGraph();
        }, 2200);
      } else {
        throw new Error(data.message || 'Failed to submit bank identifier change.');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to request bank change.');
    } finally {
      setBankSubmitting(false);
    }
  };

  // Filter edges based on filterType
  const filteredEdges = (graphData?.edges || []).filter(edge => {
    if (filterType !== 'ALL' && edge.type !== filterType) return false;
    return true;
  });

  // Filter nodes if search query provided
  const filteredNodes = (graphData?.nodes || []).filter(node => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      node.name.toLowerCase().includes(q) ||
      node.gstin.toLowerCase().includes(q) ||
      node.pan.toLowerCase().includes(q)
    );
  });

  const formattedGraphData = {
    nodes: filteredNodes,
    links: filteredEdges.map(e => ({
      ...e,
      source: typeof e.source === 'object' ? (e.source as any).id : e.source,
      target: typeof e.target === 'object' ? (e.target as any).id : e.target
    }))
  };

  const getNodeColor = (node: GraphNode) => {
    if (node.risk_level === 'HIGH' || node.risk_score >= 70) return '#EF4444'; // Red
    if (node.risk_level === 'MEDIUM' || node.risk_score >= 40) return '#F59E0B'; // Amber
    return '#10B981'; // Green
  };

  const getEdgeColor = (edge: GraphEdge) => {
    if (edge.type === 'SHARED_BANK') return '#EF4444';
    if (edge.type === 'SHARED_PAN') return '#DC2626';
    if (edge.type === 'SHARED_ADDRESS') return '#F59E0B';
    return '#6366F1';
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-3">
              <div className="p-2.5 bg-indigo-50 border border-indigo-200 rounded-lg text-indigo-700">
                <Share2 className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-900">Supplier Relationship Graph</h1>
                <p className="text-sm text-slate-500">
                  Relational attribute analysis discovering shared bank identifiers, physical addresses, phones, and PAN patterns.
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <span className="inline-flex items-center px-3 py-1 bg-amber-50 text-amber-800 border border-amber-300 rounded-full text-xs font-semibold">
              <AlertTriangle className="w-3.5 h-3.5 mr-1" />
              Relationship requires verification
            </span>
            <button
              onClick={fetchGraph}
              disabled={loading}
              className="px-3.5 py-2 text-sm font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-300 rounded-lg flex items-center space-x-2 transition"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Warning / Golden Rule Notice */}
        <div className="mt-4 p-3.5 bg-slate-50 border border-slate-200 rounded-lg flex items-start space-x-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
          <div className="text-xs text-slate-600 leading-relaxed">
            <strong className="text-slate-800">Golden Rule & Regulatory Notice:</strong> A shared attribute (such as identical banking identifiers or shared registered premises) is an <span className="font-semibold text-slate-800">investigation indicator</span> that requires cross-departmental verification, <span className="underline font-semibold">never proof of fraud</span>. SHARED_BANK accounts are automatically routed to Finance &amp; Compliance.
          </div>
        </div>

        {/* Summary Metric Badges */}
        {graphData && (
          <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-center">
              <span className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Suppliers Analyzed</span>
              <p className="text-xl font-bold text-slate-900 mt-1">{graphData.summary.total_suppliers}</p>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-center">
              <span className="text-xs text-red-600 uppercase tracking-wider font-semibold">Shared Bank Links</span>
              <p className="text-xl font-bold text-red-700 mt-1">{graphData.summary.shared_bank_relationships}</p>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-center">
              <span className="text-xs text-amber-600 uppercase tracking-wider font-semibold">Shared Address</span>
              <p className="text-xl font-bold text-amber-700 mt-1">{graphData.summary.shared_address_relationships}</p>
            </div>
            <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 text-center">
              <span className="text-xs text-indigo-600 uppercase tracking-wider font-semibold">Total Relationships</span>
              <p className="text-xl font-bold text-indigo-700 mt-1">{graphData.summary.total_relationships}</p>
            </div>
          </div>
        )}
      </div>

      {/* Graph Visualizer & Interactive Panels */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left: Force Graph Canvas (3 cols) */}
        <div className="lg:col-span-3 bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex flex-col">
          {/* Controls Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-100">
            <div className="flex items-center space-x-2">
              <Sliders className="w-4 h-4 text-slate-400" />
              <span className="text-xs font-semibold text-slate-600 uppercase">Filter Relational Indicator:</span>
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="text-xs border border-slate-300 rounded-md px-2.5 py-1.5 bg-white text-slate-700 font-medium focus:ring-1 focus:ring-indigo-500"
              >
                <option value="ALL">All Relationships</option>
                <option value="SHARED_BANK">Shared Bank Account (Critical)</option>
                <option value="SHARED_ADDRESS">Shared Address</option>
                <option value="SHARED_PHONE">Shared Phone</option>
                <option value="SHARED_PAN">Shared PAN</option>
              </select>
            </div>

            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search supplier..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="text-xs pl-8 pr-3 py-1.5 border border-slate-300 rounded-md focus:ring-1 focus:ring-indigo-500 w-44"
              />
            </div>

            <div className="flex items-center space-x-3 text-xs text-slate-500">
              <span className="flex items-center"><span className="w-2.5 h-2.5 rounded-full bg-red-500 mr-1.5"></span> High Priority</span>
              <span className="flex items-center"><span className="w-2.5 h-2.5 rounded-full bg-amber-500 mr-1.5"></span> Medium</span>
              <span className="flex items-center"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500 mr-1.5"></span> Low Priority</span>
            </div>
          </div>

          {/* Canvas Wrapper */}
          <div ref={containerRef} className="relative flex-1 bg-slate-900 rounded-lg overflow-hidden border border-slate-800 min-h-[480px]">
            {loading ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 space-y-3">
                <RefreshCw className="w-8 h-8 animate-spin text-indigo-400" />
                <p className="text-sm">Mapping relational graph topology...</p>
              </div>
            ) : error ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-red-400 p-6 text-center">
                <AlertTriangle className="w-8 h-8 mb-2" />
                <p className="text-sm font-semibold">{error}</p>
                <button onClick={fetchGraph} className="mt-3 px-3 py-1.5 bg-slate-800 text-xs text-white rounded hover:bg-slate-700">Try Again</button>
              </div>
            ) : (
              <ForceGraph2D
                width={dimensions.width}
                height={dimensions.height}
                graphData={formattedGraphData}
                nodeLabel={(n: any) => `${n.name}\nGSTIN: ${n.gstin}\nInvestigation Priority: ${n.risk_level}`}
                nodeColor={(n: any) => getNodeColor(n)}
                nodeRelSize={7}
                nodeCanvasObjectMode={() => 'after'}
                nodeCanvasObject={(node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
                  const label = (node.name || 'Vendor').split(' ')[0];
                  const fontSize = 12 / globalScale;
                  ctx.font = `${fontSize}px Sans-Serif`;
                  ctx.textAlign = 'center';
                  ctx.textBaseline = 'top';
                  ctx.fillStyle = '#E2E8F0';
                  ctx.fillText(label, node.x, node.y + 9);
                }}
                linkColor={(link: any) => getEdgeColor(link)}
                linkWidth={(link: any) => (link.type === 'SHARED_BANK' ? 3.5 : 2)}
                linkDirectionalParticles={(link: any) => (link.type === 'SHARED_BANK' ? 4 : 2)}
                linkDirectionalParticleSpeed={0.006}
                onNodeClick={(node: any) => {
                  setSelectedNode(node);
                  setSelectedEdge(null);
                }}
                onLinkClick={(link: any) => {
                  setSelectedEdge(link);
                  setSelectedNode(null);
                }}
              />
            )}
            <div className="absolute bottom-3 left-3 bg-slate-900/80 backdrop-blur border border-slate-700 text-slate-300 text-[11px] px-2.5 py-1.5 rounded pointer-events-none">
              Click node or link line for full verification details
            </div>
          </div>
        </div>

        {/* Right: Inspection Drawer / Detail Inspector (1 col) */}
        <div className="lg:col-span-1 bg-white rounded-xl shadow-sm border border-slate-200 p-5 flex flex-col space-y-4">
          <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider pb-2 border-b border-slate-100 flex items-center justify-between">
            <span>Inspector</span>
            {(selectedNode || selectedEdge) && (
              <button
                onClick={() => { setSelectedNode(null); setSelectedEdge(null); }}
                className="text-xs text-indigo-600 hover:underline capitalize"
              >
                Clear
              </button>
            )}
          </h2>

          {selectedNode ? (
            <div className="space-y-4 text-xs">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                <div className="flex items-center space-x-2">
                  <Building className="w-4 h-4 text-indigo-600" />
                  <span className="font-bold text-slate-900 text-sm truncate">{selectedNode.name}</span>
                </div>
                <div className="mt-2.5 space-y-1 text-slate-600">
                  <p><span className="text-slate-400">GSTIN:</span> <span className="font-mono font-medium text-slate-800">{selectedNode.gstin}</span></p>
                  <p><span className="text-slate-400">PAN:</span> <span className="font-mono font-medium text-slate-800">{selectedNode.pan}</span></p>
                  <p><span className="text-slate-400">Filing Status:</span> <span className="font-semibold text-emerald-700">{selectedNode.gst_filing_status}</span></p>
                  <p><span className="text-slate-400">Bank (Masked):</span> <span className="font-mono text-slate-800">{selectedNode.bank_identifier || 'N/A'}</span></p>
                  <p><span className="text-slate-400">Address:</span> <span className="text-slate-700">{selectedNode.address || 'N/A'}</span></p>
                  <p><span className="text-slate-400">Phone:</span> <span className="text-slate-700">{selectedNode.phone || 'N/A'}</span></p>
                </div>
              </div>

              <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-lg">
                <span className="text-indigo-800 font-semibold block mb-1">Investigation Priority</span>
                <div className="flex items-center justify-between">
                  <span className={`px-2.5 py-0.5 rounded text-xs font-bold ${
                    selectedNode.risk_level === 'HIGH' ? 'bg-red-100 text-red-800' : 'bg-emerald-100 text-emerald-800'
                  }`}>
                    {selectedNode.risk_level}
                  </span>
                  <span className="text-xs text-slate-500 font-medium">Score: {selectedNode.risk_score}/100</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-2 space-y-2">
                {onNavigateToScorecard && (
                  <button
                    onClick={() => onNavigateToScorecard(selectedNode.id)}
                    className="w-full px-3 py-2 bg-indigo-600 text-white rounded-lg text-xs font-medium hover:bg-indigo-700 flex items-center justify-center space-x-1.5 transition"
                  >
                    <span>View Performance Scorecard</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}

                <button
                  onClick={() => {
                    setNewBankInput('');
                    setBankChangeReason('');
                    setBankSuccessMsg(null);
                    setShowBankModal(true);
                  }}
                  className="w-full px-3 py-2 bg-white text-slate-700 border border-slate-300 rounded-lg text-xs font-medium hover:bg-slate-50 flex items-center justify-center space-x-1.5 transition"
                >
                  <DollarSign className="w-3.5 h-3.5 text-slate-500" />
                  <span>Request Bank Detail Change</span>
                </button>
              </div>
            </div>
          ) : selectedEdge ? (
            <div className="space-y-4 text-xs">
              <div className="p-3.5 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-center space-x-2 text-red-800 font-bold mb-2">
                  <AlertTriangle className="w-4 h-4 text-red-600" />
                  <span>{selectedEdge.type.replace('_', ' ')}</span>
                </div>
                <p className="text-slate-700 leading-relaxed">{selectedEdge.reason}</p>
                <div className="mt-3 pt-2.5 border-t border-red-200/60 text-slate-600">
                  <p><span className="text-slate-400">Shared Value:</span> <span className="font-mono font-bold text-slate-800">{selectedEdge.shared_value}</span></p>
                  <p className="mt-1"><span className="text-slate-400">Severity:</span> <span className="font-bold text-red-700">{selectedEdge.severity}</span></p>
                </div>
              </div>

              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 leading-relaxed text-[11px]">
                <strong>Verification Standard:</strong> {selectedEdge.disclaimer}. Auto-raised investigation for this relationship is routed to <strong>Finance/Compliance</strong>.
              </div>

              {onNavigateToInvestigations && (
                <button
                  onClick={onNavigateToInvestigations}
                  className="w-full px-3 py-2 bg-indigo-600 text-white rounded-lg text-xs font-medium hover:bg-indigo-700 flex items-center justify-center space-x-1.5 transition"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Open Investigation Center</span>
                </button>
              )}
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-slate-400 space-y-2">
              <Eye className="w-8 h-8 text-slate-300" />
              <p className="text-xs">Select any supplier node or connection link on the graph to inspect relational evidence.</p>
            </div>
          )}
        </div>
      </div>

      {/* Bank Change Request Modal (Maker-Checker Enforced) */}
      {showBankModal && selectedNode && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 border border-slate-200 animate-in fade-in zoom-in duration-150">
            <div className="flex items-center space-x-3 pb-3 border-b border-slate-100">
              <div className="p-2 bg-indigo-50 border border-indigo-200 rounded-lg text-indigo-700">
                <DollarSign className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Request Bank Identifier Change</h3>
                <p className="text-xs text-slate-500">{selectedNode.name}</p>
              </div>
            </div>

            <div className="my-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 leading-relaxed">
              <strong>Maker-Checker Guard:</strong> Modifying a vendor's bank identifier will NOT take effect immediately. It creates a formal approval request requiring sign-off by a <strong>different Finance Manager</strong> to prevent payment diversion.
            </div>

            {bankSuccessMsg ? (
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-xs flex items-center space-x-2">
                <CheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                <span>{bankSuccessMsg}</span>
              </div>
            ) : (
              <form onSubmit={handleRequestBankChange} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Current Bank Identifier</label>
                  <input
                    type="text"
                    disabled
                    value={selectedNode.bank_identifier || 'HDFC0001234-9876543210'}
                    className="w-full text-xs bg-slate-100 text-slate-500 px-3 py-2 rounded-lg border border-slate-300 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">New Bank Identifier (IFSC-AccountNumber)</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. ICIC0005678-1122334455"
                    value={newBankInput}
                    onChange={(e) => setNewBankInput(e.target.value)}
                    className="w-full text-xs px-3 py-2 rounded-lg border border-slate-300 font-mono focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Change Reason / Supporting Reference</label>
                  <textarea
                    rows={2}
                    required
                    placeholder="e.g. Official bank mandate letter received from vendor on 15-Nov-2026."
                    value={bankChangeReason}
                    onChange={(e) => setBankChangeReason(e.target.value)}
                    className="w-full text-xs px-3 py-2 rounded-lg border border-slate-300 focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setShowBankModal(false)}
                    className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={bankSubmitting}
                    className="px-4 py-2 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition flex items-center space-x-1.5"
                  >
                    {bankSubmitting ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Submitting...</span>
                      </>
                    ) : (
                      <span>Submit for Verification</span>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
