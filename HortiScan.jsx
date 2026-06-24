import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Camera, Plus, Save, Download, Trash2, Eye, ChevronDown, ChevronUp, X, MapPin, Loader2, FileText, Image as ImageIcon, Search, Pencil, Upload, BarChart3, Award, ScanLine, Info } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

// Map a measured % diseased leaf-area to a grade on the %-based disease scales.
const diseasePctMaps = {
  general_0_4: { healthy: 0, breaks: [[10, 1], [25, 2], [50, 3], [100, 4]] },
  general_0_5: { healthy: 0, breaks: [[10, 1], [25, 2], [50, 3], [75, 4], [100, 5]] },
  scale_1_6: { healthy: 1, breaks: [[10, 2], [25, 3], [50, 4], [75, 5], [100, 6]] },
  foliar_0_9: { healthy: 0, breaks: [[10, 1], [25, 3], [50, 5], [75, 7], [100, 9]] }
  // viral_0_5 omitted on purpose — it is symptom-based, not leaf-area %
};
const mapPercentToGrade = (scaleKey, pct) => {
  const m = diseasePctMaps[scaleKey];
  if (!m) return null;
  if (pct <= 0.05) return m.healthy;
  for (const [maxP, g] of m.breaks) if (pct <= maxP) return g;
  return m.breaks[m.breaks.length - 1][1];
};

const rgb2hsvLocal = (r, g, b) => {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60; if (h < 0) h += 360;
  }
  return [h, max === 0 ? 0 : d / max, max];
};

// In-browser leaf scan: segments background / healthy / diseased tissue and measures % diseased area.
const LeafScan = ({ src, scaleShort, canGrade, mapGrade, unit, onApply, onClose }) => {
  const canvasRef = useRef(null);
  const baseData = useRef(null);
  const [bgMode, setBgMode] = useState('auto');
  const [sens, setSens] = useState(0.4);
  const [overlay, setOverlay] = useState(true);
  const [res, setRes] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      const maxDim = 360;
      let w = img.width, h = img.height;
      const sc = Math.min(1, maxDim / Math.max(w, h));
      w = Math.max(1, Math.round(w * sc)); h = Math.max(1, Math.round(h * sc));
      const off = document.createElement('canvas'); off.width = w; off.height = h;
      const octx = off.getContext('2d'); octx.drawImage(img, 0, 0, w, h);
      baseData.current = { data: octx.getImageData(0, 0, w, h), w, h };
      setReady(true);
    };
    img.onerror = () => setReady(false);
    img.src = src;
  }, [src]);

  useEffect(() => {
    if (!ready) return;
    const base = baseData.current; if (!base) return;
    const { data, w, h } = base;
    const px = data.data;
    const out = new ImageData(w, h);
    const o = out.data;
    let healthy = 0, diseased = 0, bg = 0;
    const greenLow = 70 + sens * 25;
    const greenHigh = 175;
    for (let i = 0; i < px.length; i += 4) {
      const r = px[i], g = px[i + 1], b = px[i + 2];
      const [hh, ss, vv] = rgb2hsvLocal(r, g, b);
      let isBg;
      if (bgMode === 'light') isBg = vv > 0.85 && ss < 0.18;
      else if (bgMode === 'dark') isBg = vv < 0.18;
      else if (bgMode === 'blue') isBg = hh >= 170 && hh <= 275 && ss > 0.15;
      else isBg = (vv > 0.9 && ss < 0.12) || vv < 0.1 || (hh >= 175 && hh <= 275 && ss > 0.2);
      let cls;
      if (isBg) { cls = 'bg'; bg++; }
      else if (ss < 0.15) { cls = 'dis'; diseased++; }
      else if (hh >= greenLow && hh <= greenHigh) { cls = 'hea'; healthy++; }
      else { cls = 'dis'; diseased++; }
      if (!overlay) { o[i] = r; o[i + 1] = g; o[i + 2] = b; }
      else if (cls === 'bg') { o[i] = r * 0.3 + 25; o[i + 1] = g * 0.3 + 25; o[i + 2] = b * 0.3 + 25; }
      else if (cls === 'dis') { o[i] = 224; o[i + 1] = 44; o[i + 2] = 44; }
      else { o[i] = 40; o[i + 1] = 168; o[i + 2] = 64; }
      o[i + 3] = 255;
    }
    const leaf = healthy + diseased;
    const c = canvasRef.current;
    if (c) { c.width = w; c.height = h; c.getContext('2d').putImageData(out, 0, 0); }
    setRes({
      leafFrac: +((leaf / (leaf + bg || 1)) * 100).toFixed(1),
      diseasedPct: leaf ? +((diseased / leaf) * 100).toFixed(1) : 0,
      healthyPct: leaf ? +((healthy / leaf) * 100).toFixed(1) : 0,
      leaf
    });
  }, [ready, bgMode, sens, overlay]);

  const grade = res && canGrade ? mapGrade(res.diseasedPct) : null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-3" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center p-4 border-b sticky top-0 bg-white">
          <h3 className="font-bold text-gray-800 flex items-center gap-2"><ScanLine size={18} /> Leaf Scan — measure diseased area</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X size={20} /></button>
        </div>
        <div className="p-4 space-y-3">
          <div className="bg-gray-900 rounded-lg overflow-hidden flex items-center justify-center" style={{ minHeight: 180 }}>
            {ready ? <canvas ref={canvasRef} className="max-w-full h-auto" /> : <div className="text-gray-400 text-sm py-12">Loading image…</div>}
          </div>

          {res && (
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="bg-green-50 border border-green-200 rounded p-2"><div className="text-[11px] text-gray-500">Healthy</div><div className="font-bold text-green-700">{res.healthyPct}%</div></div>
              <div className="bg-red-50 border border-red-200 rounded p-2"><div className="text-[11px] text-gray-500">Diseased area</div><div className="font-bold text-red-700">{res.diseasedPct}%</div></div>
              <div className="bg-gray-50 border border-gray-200 rounded p-2"><div className="text-[11px] text-gray-500">Leaf in frame</div><div className="font-bold text-gray-700">{res.leafFrac}%</div></div>
            </div>
          )}

          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-gray-600 w-24">Background</span>
              <select value={bgMode} onChange={(e) => setBgMode(e.target.value)} className="flex-1 px-2 py-1 border rounded text-sm">
                <option value="auto">Auto-detect</option>
                <option value="light">Light (white / paper)</option>
                <option value="dark">Dark (black cloth)</option>
                <option value="blue">Blue board / sky</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-gray-600 w-24">Lesion sensitivity</span>
              <input type="range" min="0" max="1" step="0.05" value={sens} onChange={(e) => setSens(parseFloat(e.target.value))} className="flex-1" />
              <span className="text-xs text-gray-500 w-8 text-right">{Math.round(sens * 100)}</span>
            </div>
            <label className="flex items-center gap-2 text-gray-600">
              <input type="checkbox" checked={overlay} onChange={(e) => setOverlay(e.target.checked)} /> Show classification overlay (red = diseased, green = healthy)
            </label>
          </div>

          <p className="text-[11px] text-gray-400 leading-snug">Best results: a single leaf on a plain contrasting background, even lighting. Adjust the background mode and sensitivity until the overlay matches what you see, then apply.</p>

          {res && res.leaf < 50 && <p className="text-xs text-amber-700">Very little leaf detected — try a different background mode.</p>}

          <div className="flex flex-col gap-2 pt-1">
            {canGrade && grade != null ? (
              <button onClick={() => onApply(res.diseasedPct, grade)} className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-2 rounded-lg text-sm">
                Add as 1 {unit || 'leaf'} at grade {grade} ({scaleShort}) · {res ? res.diseasedPct : 0}% area
              </button>
            ) : (
              <div className="text-[11px] text-gray-500 bg-gray-50 border rounded p-2">
                Select a % leaf-area scale (0–9 / 0–4 / 0–5 / 1–6) on this disease to auto-add the scanned leaf to a grade. The measured % will still be saved.
              </div>
            )}
            <button onClick={() => onApply(res ? res.diseasedPct : 0, null)} className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-2 rounded-lg text-sm">
              Save measured % only
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const APP_VERSION = '1.0.0';

const MIT_LICENSE_TEXT = `MIT License

Copyright (c) 2026 Dr. T. Rajasekharam, Horticultural Research Station,
Dr. YSR Horticultural University

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`;

const OSS_COMPONENTS = [
  ['React & React-DOM', 'Meta Platforms, Inc.'],
  ['Vite', 'Evan You & Vite contributors'],
  ['Tailwind CSS', 'Tailwind Labs, Inc.'],
  ['Recharts', 'Recharts Group'],
  ['lucide-react', 'Lucide contributors'],
  ['Capacitor', 'Drifty Co. / Ionic'],
  ['PostCSS & Autoprefixer', 'Andrey Sitnik']
];

const HorticultureDataApp = () => {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [storageOk, setStorageOk] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [expandedRecord, setExpandedRecord] = useState(null);
  const [gpsStatus, setGpsStatus] = useState('idle'); // idle | loading | error
  const [openLegend, setOpenLegend] = useState(null); // which scale-key legend is open
  const [editingId, setEditingId] = useState(null);   // record being edited (null = new)
  const [view, setView] = useState('records');        // 'records' | 'summary'
  const [searchText, setSearchText] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterCrop, setFilterCrop] = useState('');
  const [sortBy, setSortBy] = useState('newest');

  const emptyForm = {
    category: '', subCategory: '', farmerId: '', farmerName: '', location: '', gpsCoordinates: '', siteName: '',
    cropType: '', variety: '', plantingDate: '', plantHealth: 'good',
    diseases: [], pests: [], growthParams: [], yieldParams: [], notes: '', generalImages: []
  };
  const [formData, setFormData] = useState(emptyForm);

  const [showAddDisease, setShowAddDisease] = useState(null);
  const [showAddPest, setShowAddPest] = useState(null);
  const [newDiseaseCommon, setNewDiseaseCommon] = useState('');
  const [newDiseaseScientific, setNewDiseaseScientific] = useState('');
  const [newPestCommon, setNewPestCommon] = useState('');
  const [newPestScientific, setNewPestScientific] = useState('');

  const generalImgInput = useRef(null);
  const jsonInput = useRef(null);
  const scanInput = useRef(null);
  const [scanState, setScanState] = useState(null); // { idx, src }
  const [scanForIdx, setScanForIdx] = useState(null);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [ossText, setOssText] = useState(null); // bundled third-party license text

  const cropTypes = ['Vegetables', 'Fruits', 'Flowers', 'Spices', 'Medicinal Plants', 'Plantation Crops'];

  const subCategoryOptions = {
    'Research': ['Variety Trial', 'Disease Screening', 'Survey', 'Field Experiment', 'Germplasm Evaluation'],
    'Extension': ['Farmer Training', 'Demonstration', 'Field Visit', 'Advisory', 'Front Line Demo'],
    'Precision': ['GPS Mapping', 'Sensor Monitoring', 'Drone Survey', 'Soil Analysis', 'Variable Rate Application']
  };

  const varietyOptions = {
    'Vegetables': ['Tomato', 'Potato', 'Onion', 'Cabbage', 'Cauliflower', 'Brinjal', 'Okra', 'Beans'],
    'Fruits': ['Mango', 'Banana', 'Apple', 'Orange', 'Grapes', 'Papaya', 'Guava', 'Pomegranate'],
    'Flowers': ['Rose', 'Marigold', 'Jasmine', 'Chrysanthemum', 'Orchid', 'Carnation'],
    'Spices': ['Turmeric', 'Chili', 'Cardamom', 'Pepper', 'Ginger', 'Coriander'],
    'Medicinal Plants': ['Aloe Vera', 'Tulsi', 'Ashwagandha', 'Neem', 'Brahmi'],
    'Plantation Crops': ['Coconut', 'Cashew', 'Tea', 'Coffee', 'Rubber', 'Areca Nut']
  };

  const diseaseData = {
    'Coconut': [
      { common: 'Bud Rot', scientific: 'Phytophthora palmivora' },
      { common: 'Root Wilt Disease', scientific: 'Ganoderma lucidum' },
      { common: 'Stem Bleeding', scientific: 'Thielaviopsis paradoxa' },
      { common: 'Leaf Rot', scientific: 'Colletotrichum gloeosporioides' },
      { common: 'Gray Leaf Spot', scientific: 'Pseudocercospora cocoicola' },
      { common: 'Leaf Blight', scientific: 'Helminthosporium incurvatum' },
      { common: 'Basal Stem Rot', scientific: 'Ganoderma boninense' },
      { common: 'Lethal Yellowing', scientific: 'Candidatus Phytoplasma palmae' },
      { common: 'Tatipaka Disease', scientific: 'Phytoplasma coconut root wilt' },
      { common: 'Thanjavur Wilt', scientific: 'Fusarium solani complex' },
      { common: 'Crown Rot', scientific: 'Fusarium oxysporum' },
      { common: 'Black Scorch', scientific: 'Ceratocystis paradoxa' },
      { common: 'Petiole Blight', scientific: 'Bipolaris incurvata' },
      { common: 'Kernel Rot', scientific: 'Botryodiplodia theobromae' },
      { common: 'Fruit Rot', scientific: 'Phytophthora nicotianae' },
      { common: 'Leaf Spot', scientific: 'Pestalotiopsis palmarum' },
      { common: 'Gray Leaf Blight', scientific: 'Pestalotiopsis microspora' },
      { common: 'Sooty Mold', scientific: 'Capnodium coffeae' },
      { common: 'Dry Bud Rot', scientific: 'Pythium aphanidermatum' },
      { common: 'Root Rot', scientific: 'Pythium splendens' },
      { common: 'Wilt Complex', scientific: 'Multiple fungi and nematodes' },
      { common: 'Mahali Disease', scientific: 'Nutrient deficiency complex' },
      { common: 'Red Ring Disease', scientific: 'Bursaphelenchus cocophilus' },
      { common: 'Anabe Disease', scientific: 'Ganoderma zonatum' },
      { common: 'Foliar Decay', scientific: 'Exserohilum rostratum' },
      { common: 'Nut Fall Disease', scientific: 'Colletotrichum acutatum' },
      { common: 'Leaf Stripe', scientific: 'Curvularia lunata' },
      { common: 'Brown Leaf Spot', scientific: 'Drechslera cocoicola' },
      { common: 'Button Shedding', scientific: 'Multiple physiological factors' },
      { common: 'Tender Nut Fall', scientific: 'Phytophthora katsurae' },
      { common: 'Premature Nut Fall', scientific: 'Fusarium incarnatum' },
      { common: 'Leaf Scorch', scientific: 'Xanthomonas campestris' },
      { common: 'Bacterial Bud Rot', scientific: 'Erwinia chrysanthemi' },
      { common: 'Yellowing Disease', scientific: 'Spiroplasma citri' },
      { common: 'Foliar Necrosis', scientific: 'Lasiodiplodia theobromae' },
      { common: 'White Leaf Spot', scientific: 'Schizothyrium pomi' },
      { common: 'Immature Nut Fall', scientific: 'Colletotrichum truncatum' },
      { common: 'Seedling Blight', scientific: 'Rhizoctonia solani' },
      { common: 'Tip Dieback', scientific: 'Botryosphaeria dothidea' },
      { common: 'Root Collar Rot', scientific: 'Phellinus noxius' },
      { common: 'Inflorescence Rot', scientific: 'Fusarium moniliforme' },
      { common: 'Leaf Curl', scientific: 'Viral complex' },
      { common: 'Rachis Blight', scientific: 'Thielaviopsis ethacetica' },
      { common: 'Spindle Rot', scientific: 'Chalara paradoxa' },
      { common: 'Abnormal Leaf', scientific: 'Mycoplasma-like organisms' },
      { common: 'Chlorotic Streak', scientific: 'Phytoplasma asteris' },
      { common: 'Trunk Rot', scientific: 'Polyporus zonalis' },
      { common: 'Heart Rot', scientific: 'Marasmiellus scandens' },
      { common: 'Frond Wilt', scientific: 'Fusarium pallidoroseum' },
      { common: 'Button Rot', scientific: 'Pestalotiopsis versicolor' }
    ],
    'Cashew': [
      { common: 'Anthracnose', scientific: 'Colletotrichum gloeosporioides' },
      { common: 'Die Back', scientific: 'Lasiodiplodia theobromae' },
      { common: 'Powdery Mildew', scientific: 'Oidium anacardii' },
      { common: 'Leaf Spot', scientific: 'Pestalotiopsis spp.' },
      { common: 'Gummosis', scientific: 'Phytophthora spp.' },
      { common: 'Root Rot', scientific: 'Pythium spp.' },
      { common: 'Collar Rot', scientific: 'Phytophthora palmivora' },
      { common: 'Fruit Rot', scientific: 'Phytophthora spp.' },
      { common: 'Bacterial Leaf Blight', scientific: 'Xanthomonas spp.' },
      { common: 'Phytophthora Wilt', scientific: 'Phytophthora spp.' }
    ],
    'Tomato': [
      { common: 'Early Blight', scientific: 'Alternaria solani' },
      { common: 'Late Blight', scientific: 'Phytophthora infestans' },
      { common: 'Septoria Leaf Spot', scientific: 'Septoria lycopersici' },
      { common: 'Bacterial Wilt', scientific: 'Ralstonia solanacearum' },
      { common: 'Fusarium Wilt Race 1', scientific: 'Fusarium oxysporum f.sp. lycopersici race 1' },
      { common: 'Fusarium Wilt Race 2', scientific: 'Fusarium oxysporum f.sp. lycopersici race 2' },
      { common: 'Fusarium Wilt Race 3', scientific: 'Fusarium oxysporum f.sp. lycopersici race 3' },
      { common: 'Verticillium Wilt', scientific: 'Verticillium dahliae' },
      { common: 'Tomato Mosaic Virus', scientific: 'Tomato mosaic virus (ToMV)' },
      { common: 'Leaf Curl Virus', scientific: 'Tomato leaf curl virus (ToLCV)' },
      { common: 'Damping Off', scientific: 'Pythium aphanidermatum' },
      { common: 'Powdery Mildew', scientific: 'Leveillula taurica' },
      { common: 'Bacterial Spot', scientific: 'Xanthomonas vesicatoria' },
      { common: 'Target Spot', scientific: 'Corynespora cassiicola' },
      { common: 'Gray Mold', scientific: 'Botrytis cinerea' },
      { common: 'Anthracnose', scientific: 'Colletotrichum coccodes' },
      { common: 'Southern Blight', scientific: 'Sclerotium rolfsii' },
      { common: 'Buckeye Rot', scientific: 'Phytophthora capsici' },
      { common: 'Leaf Mold', scientific: 'Passalora fulva' },
      { common: 'Bacterial Canker', scientific: 'Clavibacter michiganensis subsp. michiganensis' },
      { common: 'Root Knot Nematode', scientific: 'Meloidogyne incognita' },
      { common: 'Spotted Wilt Virus', scientific: 'Tomato spotted wilt virus (TSWV)' },
      { common: 'Yellow Leaf Curl Virus', scientific: 'Tomato yellow leaf curl virus (TYLCV)' },
      { common: 'Bacterial Speck', scientific: 'Pseudomonas syringae pv. tomato' },
      { common: 'Corky Root Rot', scientific: 'Pyrenochaeta lycopersici' },
      { common: 'Stem Rot', scientific: 'Sclerotinia sclerotiorum' },
      { common: 'Crown Rot', scientific: 'Phytophthora parasitica' },
      { common: 'Pith Necrosis', scientific: 'Pseudomonas corrugata' },
      { common: 'Black Mold', scientific: 'Alternaria alternata' },
      { common: 'Fusarium Crown Rot', scientific: 'Fusarium solani' },
      { common: 'Rhizoctonia Damping Off', scientific: 'Rhizoctonia solani' },
      { common: 'Tobacco Mosaic Virus', scientific: 'Tobacco mosaic virus (TMV)' },
      { common: 'Cucumber Mosaic Virus', scientific: 'Cucumber mosaic virus (CMV)' },
      { common: 'Alternaria Stem Canker', scientific: 'Alternaria dauci' },
      { common: 'Gray Wall', scientific: 'Physiological disorder' },
      { common: 'Ghost Spot', scientific: 'Botrytis cinerea (early infection)' },
      { common: 'Brown Rugose Fruit', scientific: 'Tomato brown rugose fruit virus (ToBRFV)' },
      { common: 'Verticillium Wilt Race 2', scientific: 'Verticillium albo-atrum' },
      { common: 'White Mold', scientific: 'Sclerotinia minor' },
      { common: 'Black Dot Root Rot', scientific: 'Colletotrichum coccodes' },
      { common: 'Stemphylium Leaf Spot', scientific: 'Stemphylium solani' },
      { common: 'Bacterial Soft Rot', scientific: 'Pectobacterium carotovorum' },
      { common: 'Tomato Chlorosis Virus', scientific: 'Tomato chlorosis virus (ToCV)' },
      { common: 'Tomato Infectious Chlorosis Virus', scientific: 'Tomato infectious chlorosis virus (TICV)' },
      { common: 'Tomato Torrado Virus', scientific: 'Tomato torrado virus (ToTV)' },
      { common: 'Phoma Rot', scientific: 'Phoma destructiva' },
      { common: 'Charcoal Rot', scientific: 'Macrophomina phaseolina' },
      { common: 'Tomato Bushy Stunt Virus', scientific: 'Tomato bushy stunt virus (TBSV)' },
      { common: 'Pythium Root Rot', scientific: 'Pythium ultimum' },
      { common: 'Tomato Mottle Virus', scientific: 'Tomato mottle virus (ToMoV)' }
    ],
    'Potato': [
      { common: 'Late Blight', scientific: 'Phytophthora infestans' },
      { common: 'Early Blight', scientific: 'Alternaria solani' },
      { common: 'Black Scurf', scientific: 'Rhizoctonia solani' },
      { common: 'Common Scab', scientific: 'Streptomyces scabies' },
      { common: 'Dry Rot', scientific: 'Fusarium sambucinum' },
      { common: 'Bacterial Wilt', scientific: 'Ralstonia solanacearum' },
      { common: 'Potato Virus Y', scientific: 'Potato virus Y (PVY)' },
      { common: 'Leaf Roll Virus', scientific: 'Potato leafroll virus (PLRV)' },
      { common: 'Brown Rot', scientific: 'Ralstonia solanacearum race 3' },
      { common: 'Blackleg', scientific: 'Pectobacterium atrosepticum' },
      { common: 'Powdery Scab', scientific: 'Spongospora subterranea' },
      { common: 'Silver Scurf', scientific: 'Helminthosporium solani' },
      { common: 'Pink Rot', scientific: 'Phytophthora erythroseptica' },
      { common: 'Verticillium Wilt', scientific: 'Verticillium albo-atrum' },
      { common: 'White Mold', scientific: 'Sclerotinia sclerotiorum' },
      { common: 'Charcoal Rot', scientific: 'Macrophomina phaseolina' },
      { common: 'Soft Rot', scientific: 'Pectobacterium carotovorum' },
      { common: 'Ring Rot', scientific: 'Clavibacter sepedonicus' },
      { common: 'Wart Disease', scientific: 'Synchytrium endobioticum' },
      { common: 'Powdery Mildew', scientific: 'Erysiphe cichoracearum' },
      { common: 'Fusarium Dry Rot', scientific: 'Fusarium coeruleum' },
      { common: 'Gangrene', scientific: 'Phoma foveata' },
      { common: 'Pythium Leak', scientific: 'Pythium ultimum' },
      { common: 'Potato Virus X', scientific: 'Potato virus X (PVX)' },
      { common: 'Potato Virus A', scientific: 'Potato virus A (PVA)' },
      { common: 'Potato Virus M', scientific: 'Potato virus M (PVM)' },
      { common: 'Potato Virus S', scientific: 'Potato virus S (PVS)' },
      { common: 'Potato Mop Top Virus', scientific: 'Potato mop-top virus (PMTV)' },
      { common: 'Tobacco Rattle Virus', scientific: 'Tobacco rattle virus (TRV)' },
      { common: 'Alternaria Brown Spot', scientific: 'Alternaria alternata' },
      { common: 'Gray Mold', scientific: 'Botrytis cinerea' },
      { common: 'Stem Canker', scientific: 'Rhizoctonia solani AG-3' },
      { common: 'Aerial Stem Rot', scientific: 'Rhizoctonia solani AG-2-1' },
      { common: 'Corky Ring Spot', scientific: 'Tobacco rattle virus (TRV)' },
      { common: 'Skin Spot', scientific: 'Polyscytalum pustulans' },
      { common: 'Crater Rot', scientific: 'Pectobacterium carotovorum' },
      { common: 'Bacterial Soft Rot', scientific: 'Dickeya dadantii' },
      { common: 'Bacterial Ring Rot', scientific: 'Clavibacter michiganensis subsp. sepedonicus' },
      { common: 'Zebra Chip', scientific: 'Candidatus Liberibacter solanacearum' },
      { common: 'Potato Spindle Tuber Viroid', scientific: 'Potato spindle tuber viroid (PSTVd)' },
      { common: 'Black Dot', scientific: 'Colletotrichum coccodes' },
      { common: 'Rhizoctonia Stem Canker', scientific: 'Rhizoctonia solani AG-4' },
      { common: 'Target Spot', scientific: 'Corynespora cassiicola' },
      { common: 'Southern Blight', scientific: 'Sclerotium rolfsii' },
      { common: 'Fusarium Wilt', scientific: 'Fusarium oxysporum f.sp. tuberosi' },
      { common: 'Phytophthora Root Rot', scientific: 'Phytophthora cryptogea' },
      { common: 'Lenticel Spot', scientific: 'Physiological disorder' },
      { common: 'Pink Eye', scientific: 'Pseudomonas fluorescens' },
      { common: 'Leak', scientific: 'Pythium aphanidermatum' },
      { common: 'Rosette Mosaic', scientific: 'Multiple viruses complex' }
    ],
    'Mango': [
      { common: 'Anthracnose', scientific: 'Colletotrichum gloeosporioides' },
      { common: 'Powdery Mildew', scientific: 'Oidium mangiferae' },
      { common: 'Die Back', scientific: 'Lasiodiplodia theobromae' },
      { common: 'Malformation', scientific: 'Fusarium mangiferae' },
      { common: 'Sooty Mold', scientific: 'Capnodium mangiferae' },
      { common: 'Red Rust', scientific: 'Cephaleuros virescens' },
      { common: 'Bacterial Canker', scientific: 'Xanthomonas campestris pv. mangiferaeindicae' },
      { common: 'Stem End Rot', scientific: 'Lasiodiplodia theobromae' },
      { common: 'Alternaria Leaf Spot', scientific: 'Alternaria alternata' },
      { common: 'Phoma Blight', scientific: 'Phoma spp.' },
      { common: 'Scab', scientific: 'Elsinoe mangiferae' },
      { common: 'Black Mildew', scientific: 'Meliola mangiferae' },
      { common: 'Internal Necrosis', scientific: 'Physiological disorder' },
      { common: 'Verticillium Wilt', scientific: 'Verticillium albo-atrum' },
      { common: 'Root Rot', scientific: 'Phytophthora spp.' },
      { common: 'Gummosis', scientific: 'Multiple pathogens' },
      { common: 'Leaf Spot', scientific: 'Pestalotiopsis spp.' },
      { common: 'Tip Burn', scientific: 'Physiological disorder' },
      { common: 'Pink Disease', scientific: 'Corticium salmonicolor' },
      { common: 'Diplodia Rot', scientific: 'Diplodia natalensis' }
    ],
    'Banana': [
      { common: 'Panama Wilt', scientific: 'Fusarium oxysporum f.sp. cubense' },
      { common: 'Sigatoka Leaf Spot', scientific: 'Mycosphaerella musicola' },
      { common: 'Bunchy Top Virus', scientific: 'Banana bunchy top virus (BBTV)' },
      { common: 'Bacterial Wilt', scientific: 'Xanthomonas campestris pv. musacearum' },
      { common: 'Cigar End Rot', scientific: 'Verticillium theobromae' },
      { common: 'Anthracnose', scientific: 'Colletotrichum musae' },
      { common: 'Crown Rot', scientific: 'Multiple fungi' },
      { common: 'Moko Disease', scientific: 'Ralstonia solanacearum' },
      { common: 'Freckle Disease', scientific: 'Phyllosticta musarum' },
      { common: 'Tip Over Disease', scientific: 'Erwinia chrysanthemi' },
      { common: 'Black Sigatoka', scientific: 'Mycosphaerella fijiensis' },
      { common: 'Finger Rot', scientific: 'Fusarium spp.' },
      { common: 'Heart Rot', scientific: 'Erwinia spp.' },
      { common: 'Rhizome Rot', scientific: 'Pythium spp.' },
      { common: 'Leaf Speckle', scientific: 'Mycosphaerella musae' },
      { common: 'Blood Disease', scientific: 'Ralstonia syzygii subsp. celebesensis' },
      { common: 'Bract Mosaic Virus', scientific: 'Banana bract mosaic virus (BBrMV)' },
      { common: 'Streak Virus', scientific: 'Banana streak virus (BSV)' },
      { common: 'Cucumber Mosaic Virus', scientific: 'Cucumber mosaic virus (CMV)' },
      { common: 'Pseudo Stem Weevil Rot', scientific: 'Secondary bacterial infection' }
    ],
    'Rose': [
      { common: 'Black Spot', scientific: 'Diplocarpon rosae' },
      { common: 'Powdery Mildew', scientific: 'Podosphaera pannosa' },
      { common: 'Rust', scientific: 'Phragmidium spp.' },
      { common: 'Downy Mildew', scientific: 'Peronospora sparsa' },
      { common: 'Botrytis Blight', scientific: 'Botrytis cinerea' },
      { common: 'Canker', scientific: 'Leptosphaeria coniothyrium' },
      { common: 'Crown Gall', scientific: 'Agrobacterium tumefaciens' },
      { common: 'Rose Mosaic Virus', scientific: 'Rose mosaic virus (RMV)' },
      { common: 'Anthracnose', scientific: 'Sphaceloma rosarum' },
      { common: 'Dieback', scientific: 'Botryosphaeria dothidea' },
      { common: 'Stem Canker', scientific: 'Coniothyrium spp.' },
      { common: 'Root Rot', scientific: 'Phytophthora spp.' },
      { common: 'Cercospora Leaf Spot', scientific: 'Cercospora rosicola' },
      { common: 'Alternaria Leaf Spot', scientific: 'Alternaria spp.' },
      { common: 'Bacterial Blight', scientific: 'Pseudomonas syringae' },
      { common: 'Verticillium Wilt', scientific: 'Verticillium spp.' },
      { common: 'Petal Blight', scientific: 'Botrytis cinerea' },
      { common: 'Stem Girdling', scientific: 'Coniothyrium fuckelii' },
      { common: 'Leaf Curl', scientific: 'Aphid-transmitted viruses' },
      { common: 'Gray Mold', scientific: 'Botrytis cinerea' }
    ],
    'Chili': [
      { common: 'Anthracnose Fruit Rot', scientific: 'Colletotrichum capsici' },
      { common: 'Powdery Mildew', scientific: 'Leveillula taurica' },
      { common: 'Damping Off', scientific: 'Pythium aphanidermatum' },
      { common: 'Bacterial Wilt', scientific: 'Ralstonia solanacearum' },
      { common: 'Leaf Curl Virus', scientific: 'Chilli leaf curl virus (ChiLCV)' },
      { common: 'Mosaic Virus', scientific: 'Pepper mild mottle virus (PMMoV)' },
      { common: 'Cercospora Leaf Spot', scientific: 'Cercospora capsici' },
      { common: 'Fusarium Wilt', scientific: 'Fusarium oxysporum f.sp. capsici' },
      { common: 'Phytophthora Blight', scientific: 'Phytophthora capsici' },
      { common: 'Die Back', scientific: 'Colletotrichum gloeosporioides' },
      { common: 'Bacterial Leaf Spot', scientific: 'Xanthomonas euvesicatoria' },
      { common: 'Verticillium Wilt', scientific: 'Verticillium dahliae' },
      { common: 'Southern Blight', scientific: 'Sclerotium rolfsii' },
      { common: 'Gray Mold', scientific: 'Botrytis cinerea' },
      { common: 'Alternaria Blight', scientific: 'Alternaria alternata' },
      { common: 'Root Knot Nematode', scientific: 'Meloidogyne incognita' },
      { common: 'Soft Rot', scientific: 'Pectobacterium carotovorum' },
      { common: 'Tobacco Mosaic Virus', scientific: 'Tobacco mosaic virus (TMV)' },
      { common: 'Cucumber Mosaic Virus', scientific: 'Cucumber mosaic virus (CMV)' },
      { common: 'Charcoal Rot', scientific: 'Macrophomina phaseolina' },
      { common: 'Pythium Root Rot', scientific: 'Pythium ultimum' },
      { common: 'Rhizoctonia Root Rot', scientific: 'Rhizoctonia solani' },
      { common: 'Pepper Veinal Mottle Virus', scientific: 'Pepper veinal mottle virus (PVMV)' },
      { common: 'Tomato Spotted Wilt Virus', scientific: 'Tomato spotted wilt virus (TSWV)' },
      { common: 'Bacterial Soft Rot', scientific: 'Erwinia carotovora subsp. carotovora' },
      { common: 'Black Spot', scientific: 'Xanthomonas campestris pv. vesicatoria' },
      { common: 'White Mold', scientific: 'Sclerotinia sclerotiorum' },
      { common: 'Alternaria Stem Canker', scientific: 'Alternaria solani' },
      { common: 'Frogeye Leaf Spot', scientific: 'Cercospora citrullina' },
      { common: 'Anthracnose Crown Rot', scientific: 'Colletotrichum truncatum' },
      { common: 'Stem Rot', scientific: 'Sclerotinia minor' },
      { common: 'Fusarium Crown Rot', scientific: 'Fusarium solani' },
      { common: 'Phoma Blight', scientific: 'Phoma exigua' },
      { common: 'Target Spot', scientific: 'Corynespora cassiicola' },
      { common: 'Leaf Blight', scientific: 'Stemphylium solani' },
      { common: 'Collar Rot', scientific: 'Sclerotium rolfsii' },
      { common: 'Pepper Yellow Vein Virus', scientific: 'Pepper yellow vein virus (PeYVV)' },
      { common: 'Tobacco Etch Virus', scientific: 'Tobacco etch virus (TEV)' },
      { common: 'Potato Virus Y', scientific: 'Potato virus Y (PVY) pepper strain' },
      { common: 'Brown Spot', scientific: 'Stemphylium capsici' },
      { common: 'Gummy Stem Blight', scientific: 'Didymella bryoniae' },
      { common: 'Bacterial Canker', scientific: 'Clavibacter michiganensis subsp. capsici' },
      { common: 'Black Mold', scientific: 'Alternaria tenuissima' },
      { common: 'Sooty Mold', scientific: 'Capnodium citri' },
      { common: 'Pith Necrosis', scientific: 'Pseudomonas corrugata' },
      { common: 'Pepper Huasteco Virus', scientific: 'Pepper huasteco virus (PHV)' },
      { common: 'Blossom End Rot', scientific: 'Calcium deficiency disorder' },
      { common: 'Sunscald', scientific: 'Physiological disorder' },
      { common: 'Pepper Golden Mosaic Virus', scientific: 'Pepper golden mosaic virus (PepGMV)' },
      { common: 'Choanephora Rot', scientific: 'Choanephora cucurbitarum' }
    ],
    'Brinjal': [
      { common: 'Bacterial Wilt', scientific: 'Ralstonia solanacearum' },
      { common: 'Phomopsis Blight & Fruit Rot', scientific: 'Phomopsis vexans' },
      { common: 'Little Leaf', scientific: 'Candidatus Phytoplasma' },
      { common: 'Fusarium Wilt', scientific: 'Fusarium oxysporum f.sp. melongenae' },
      { common: 'Verticillium Wilt', scientific: 'Verticillium dahliae' },
      { common: 'Damping Off', scientific: 'Pythium aphanidermatum' },
      { common: 'Alternaria Leaf Spot', scientific: 'Alternaria melongenae' },
      { common: 'Cercospora Leaf Spot', scientific: 'Cercospora solani-melongenae' },
      { common: 'Sclerotinia Stem Rot', scientific: 'Sclerotinia sclerotiorum' },
      { common: 'Powdery Mildew', scientific: 'Leveillula taurica' },
      { common: 'Mosaic', scientific: 'Cucumber mosaic virus (CMV)' },
      { common: 'Root Knot Nematode', scientific: 'Meloidogyne incognita' }
    ],
    'Okra': [
      { common: 'Yellow Vein Mosaic', scientific: 'Bhendi yellow vein mosaic virus (BYVMV)' },
      { common: 'Enation Leaf Curl', scientific: 'Okra enation leaf curl virus' },
      { common: 'Powdery Mildew', scientific: 'Erysiphe cichoracearum' },
      { common: 'Cercospora Leaf Spot', scientific: 'Cercospora abelmoschi' },
      { common: 'Fusarium Wilt', scientific: 'Fusarium oxysporum f.sp. vasinfectum' },
      { common: 'Collar Rot', scientific: 'Sclerotium rolfsii' },
      { common: 'Damping Off', scientific: 'Pythium spp.' },
      { common: 'Anthracnose', scientific: 'Colletotrichum dematium' },
      { common: 'Wet Rot', scientific: 'Choanephora cucurbitarum' },
      { common: 'Root Knot Nematode', scientific: 'Meloidogyne incognita' }
    ],
    'Onion': [
      { common: 'Purple Blotch', scientific: 'Alternaria porri' },
      { common: 'Stemphylium Blight', scientific: 'Stemphylium vesicarium' },
      { common: 'Downy Mildew', scientific: 'Peronospora destructor' },
      { common: 'Basal Rot', scientific: 'Fusarium oxysporum f.sp. cepae' },
      { common: 'Neck Rot', scientific: 'Botrytis allii' },
      { common: 'White Rot', scientific: 'Sclerotium cepivorum' },
      { common: 'Black Mould', scientific: 'Aspergillus niger' },
      { common: 'Smut', scientific: 'Urocystis cepulae' },
      { common: 'Pink Root', scientific: 'Setophoma terrestris' },
      { common: 'Iris Yellow Spot', scientific: 'Iris yellow spot virus (IYSV)' },
      { common: 'Bacterial Soft Rot', scientific: 'Pectobacterium carotovorum' }
    ],
    'Cabbage': [
      { common: 'Black Rot', scientific: 'Xanthomonas campestris pv. campestris' },
      { common: 'Club Root', scientific: 'Plasmodiophora brassicae' },
      { common: 'Downy Mildew', scientific: 'Hyaloperonospora parasitica' },
      { common: 'Alternaria Leaf Spot', scientific: 'Alternaria brassicae' },
      { common: 'Sclerotinia Stem Rot', scientific: 'Sclerotinia sclerotiorum' },
      { common: 'Black Leg', scientific: 'Phoma lingam' },
      { common: 'Wirestem', scientific: 'Rhizoctonia solani' },
      { common: 'Damping Off', scientific: 'Pythium spp.' },
      { common: 'Fusarium Yellows', scientific: 'Fusarium oxysporum f.sp. conglutinans' },
      { common: 'Bacterial Soft Rot', scientific: 'Pectobacterium carotovorum' }
    ],
    'Cauliflower': [
      { common: 'Black Rot', scientific: 'Xanthomonas campestris pv. campestris' },
      { common: 'Downy Mildew', scientific: 'Hyaloperonospora parasitica' },
      { common: 'Alternaria Leaf Spot', scientific: 'Alternaria brassicae' },
      { common: 'Club Root', scientific: 'Plasmodiophora brassicae' },
      { common: 'Sclerotinia Rot', scientific: 'Sclerotinia sclerotiorum' },
      { common: 'Curd Blight', scientific: 'Alternaria brassicicola' },
      { common: 'Black Leg', scientific: 'Phoma lingam' },
      { common: 'Damping Off', scientific: 'Pythium spp.' },
      { common: 'Bacterial Soft Rot', scientific: 'Pectobacterium carotovorum' },
      { common: 'Whiptail', scientific: 'Molybdenum deficiency (physiological)' }
    ],
    'Beans': [
      { common: 'Anthracnose', scientific: 'Colletotrichum lindemuthianum' },
      { common: 'Angular Leaf Spot', scientific: 'Pseudocercospora griseola' },
      { common: 'Rust', scientific: 'Uromyces appendiculatus' },
      { common: 'Bacterial Blight', scientific: 'Xanthomonas axonopodis pv. phaseoli' },
      { common: 'Halo Blight', scientific: 'Pseudomonas savastanoi pv. phaseolicola' },
      { common: 'Bean Common Mosaic', scientific: 'Bean common mosaic virus (BCMV)' },
      { common: 'Web Blight', scientific: 'Rhizoctonia solani' },
      { common: 'Powdery Mildew', scientific: 'Erysiphe polygoni' },
      { common: 'Fusarium Wilt', scientific: 'Fusarium oxysporum f.sp. phaseoli' },
      { common: 'White Mold', scientific: 'Sclerotinia sclerotiorum' }
    ],
    'Apple': [
      { common: 'Apple Scab', scientific: 'Venturia inaequalis' },
      { common: 'Powdery Mildew', scientific: 'Podosphaera leucotricha' },
      { common: 'Fire Blight', scientific: 'Erwinia amylovora' },
      { common: 'Cedar Apple Rust', scientific: 'Gymnosporangium juniperi-virginianae' },
      { common: 'Collar Rot', scientific: 'Phytophthora cactorum' },
      { common: 'Bitter Rot', scientific: 'Colletotrichum gloeosporioides' },
      { common: 'White Root Rot', scientific: 'Dematophora necatrix' },
      { common: 'Marssonina Leaf Blotch', scientific: 'Marssonina coronaria' },
      { common: 'Sooty Blotch', scientific: 'Gloeodes pomigena' },
      { common: 'Crown Gall', scientific: 'Agrobacterium tumefaciens' },
      { common: 'Apple Mosaic', scientific: 'Apple mosaic virus (ApMV)' }
    ],
    'Orange': [
      { common: 'Citrus Canker', scientific: 'Xanthomonas citri pv. citri' },
      { common: 'Greening (HLB)', scientific: 'Candidatus Liberibacter asiaticus' },
      { common: 'Gummosis / Foot Rot', scientific: 'Phytophthora nicotianae' },
      { common: 'Tristeza', scientific: 'Citrus tristeza virus (CTV)' },
      { common: 'Scab', scientific: 'Elsinoe fawcettii' },
      { common: 'Anthracnose / Dieback', scientific: 'Colletotrichum gloeosporioides' },
      { common: 'Powdery Mildew', scientific: 'Oidium tingitaninum' },
      { common: 'Greasy Spot', scientific: 'Mycosphaerella citri' },
      { common: 'Melanose', scientific: 'Diaporthe citri' },
      { common: 'Sooty Mould', scientific: 'Capnodium citri' }
    ],
    'Grapes': [
      { common: 'Downy Mildew', scientific: 'Plasmopara viticola' },
      { common: 'Powdery Mildew', scientific: 'Erysiphe necator' },
      { common: 'Anthracnose', scientific: 'Elsinoe ampelina' },
      { common: 'Bacterial Leaf Spot', scientific: 'Xanthomonas campestris pv. viticola' },
      { common: 'Rust', scientific: 'Phakopsora euvitis' },
      { common: 'Botrytis Bunch Rot', scientific: 'Botrytis cinerea' },
      { common: 'Black Rot', scientific: 'Guignardia bidwellii' },
      { common: 'Phomopsis Cane & Leaf Spot', scientific: 'Phomopsis viticola' },
      { common: 'Crown Gall', scientific: 'Agrobacterium vitis' },
      { common: 'Leaf Roll', scientific: 'Grapevine leafroll-associated virus' }
    ],
    'Guava': [
      { common: 'Wilt', scientific: 'Fusarium oxysporum f.sp. psidii' },
      { common: 'Anthracnose', scientific: 'Colletotrichum gloeosporioides' },
      { common: 'Fruit Canker', scientific: 'Pseudocercospora psidii' },
      { common: 'Algal Leaf Spot (Red Rust)', scientific: 'Cephaleuros virescens' },
      { common: 'Stylar-end Rot', scientific: 'Phomopsis psidii' },
      { common: 'Dieback', scientific: 'Botryodiplodia theobromae' },
      { common: 'Fruit Rot', scientific: 'Phytophthora nicotianae' },
      { common: 'Damping Off', scientific: 'Pythium spp.' },
      { common: 'Sooty Mould', scientific: 'Capnodium spp.' }
    ],
    'Pomegranate': [
      { common: 'Bacterial Blight', scientific: 'Xanthomonas axonopodis pv. punicae' },
      { common: 'Anthracnose', scientific: 'Colletotrichum gloeosporioides' },
      { common: 'Wilt', scientific: 'Ceratocystis fimbriata' },
      { common: 'Fruit Rot', scientific: 'Aspergillus niger' },
      { common: 'Heart Rot', scientific: 'Alternaria alternata' },
      { common: 'Cercospora Leaf & Fruit Spot', scientific: 'Cercospora punicae' },
      { common: 'Fruit Spot', scientific: 'Coniella granati' },
      { common: 'Fusarium Wilt', scientific: 'Fusarium oxysporum' },
      { common: 'Sooty Mould', scientific: 'Capnodium spp.' }
    ],
    'Turmeric': [
      { common: 'Rhizome Rot', scientific: 'Pythium aphanidermatum' },
      { common: 'Leaf Blotch', scientific: 'Taphrina maculans' },
      { common: 'Leaf Spot', scientific: 'Colletotrichum capsici' },
      { common: 'Bacterial Wilt', scientific: 'Ralstonia solanacearum' },
      { common: 'Dry Rot', scientific: 'Fusarium solani' },
      { common: 'Root Knot Nematode', scientific: 'Meloidogyne incognita' }
    ],
    'Ginger': [
      { common: 'Soft Rot / Rhizome Rot', scientific: 'Pythium aphanidermatum' },
      { common: 'Bacterial Wilt', scientific: 'Ralstonia solanacearum' },
      { common: 'Leaf Spot', scientific: 'Phyllosticta zingiberi' },
      { common: 'Dry Rot', scientific: 'Fusarium oxysporum f.sp. zingiberi' },
      { common: 'Storage Rot', scientific: 'Aspergillus niger' },
      { common: 'Root Knot Nematode', scientific: 'Meloidogyne incognita' }
    ],
    'Cardamom': [
      { common: 'Katte (Mosaic)', scientific: 'Cardamom mosaic virus' },
      { common: 'Capsule Rot (Azhukal)', scientific: 'Phytophthora meadii' },
      { common: 'Rhizome Rot (Clump Rot)', scientific: 'Pythium vexans' },
      { common: 'Chenthal (Leaf Blight)', scientific: 'Colletotrichum gloeosporioides' },
      { common: 'Damping Off', scientific: 'Rhizoctonia solani' },
      { common: 'Leaf Spot', scientific: 'Phaeodactylium venkatesanum' }
    ],
    'Pepper': [
      { common: 'Foot Rot (Quick Wilt)', scientific: 'Phytophthora capsici' },
      { common: 'Slow Decline (Slow Wilt)', scientific: 'Radopholus similis + Fusarium' },
      { common: 'Anthracnose (Pollu)', scientific: 'Colletotrichum gloeosporioides' },
      { common: 'Phyllody', scientific: 'Phytoplasma' },
      { common: 'Stunt Disease', scientific: 'Cucumber mosaic virus / Piper yellow mottle virus' },
      { common: 'Basal Wilt', scientific: 'Sclerotium rolfsii' }
    ],
    'Coriander': [
      { common: 'Stem Gall', scientific: 'Protomyces macrosporus' },
      { common: 'Powdery Mildew', scientific: 'Erysiphe polygoni' },
      { common: 'Wilt', scientific: 'Fusarium oxysporum f.sp. corianderii' },
      { common: 'Damping Off', scientific: 'Pythium spp.' },
      { common: 'Bacterial Leaf Spot', scientific: 'Pseudomonas syringae pv. coriandricola' },
      { common: 'Grain Mould', scientific: 'Alternaria / Cladosporium spp.' }
    ],
    'Marigold': [
      { common: 'Damping Off', scientific: 'Pythium / Rhizoctonia spp.' },
      { common: 'Leaf Spot / Blight', scientific: 'Alternaria tagetica' },
      { common: 'Powdery Mildew', scientific: 'Leveillula taurica' },
      { common: 'Botrytis Blight', scientific: 'Botrytis cinerea' },
      { common: 'Collar Rot', scientific: 'Sclerotium rolfsii' },
      { common: 'Wilt', scientific: 'Fusarium oxysporum' },
      { common: 'Root Rot', scientific: 'Rhizoctonia solani' }
    ],
    'Jasmine': [
      { common: 'Leaf Spot', scientific: 'Cercospora jasminicola' },
      { common: 'Leaf Blight', scientific: 'Alternaria spp.' },
      { common: 'Rust', scientific: 'Uromyces hobsoni' },
      { common: 'Powdery Mildew', scientific: 'Oidium jasmini' },
      { common: 'Wilt', scientific: 'Fusarium spp.' },
      { common: 'Root Rot', scientific: 'Rhizoctonia solani' }
    ],
    'Chrysanthemum': [
      { common: 'White Rust', scientific: 'Puccinia horiana' },
      { common: 'Septoria Leaf Spot', scientific: 'Septoria obesa' },
      { common: 'Powdery Mildew', scientific: 'Golovinomyces cichoracearum' },
      { common: 'Wilt', scientific: 'Fusarium oxysporum f.sp. chrysanthemi' },
      { common: 'Ray Blight', scientific: 'Itersonilia perplexans' },
      { common: 'Bacterial Blight', scientific: 'Dickeya chrysanthemi' },
      { common: 'Mosaic', scientific: 'Chrysanthemum mosaic virus' },
      { common: 'Damping Off', scientific: 'Pythium spp.' }
    ],
    'Orchid': [
      { common: 'Black Rot', scientific: 'Phytophthora palmivora' },
      { common: 'Soft Rot', scientific: 'Pectobacterium carotovorum' },
      { common: 'Brown Spot', scientific: 'Acidovorax cattleyae' },
      { common: 'Anthracnose', scientific: 'Colletotrichum gloeosporioides' },
      { common: 'Leaf Spot', scientific: 'Cercospora spp.' },
      { common: 'Fusarium Wilt', scientific: 'Fusarium oxysporum' },
      { common: 'Cymbidium Mosaic', scientific: 'Cymbidium mosaic virus (CymMV)' },
      { common: 'Odontoglossum Ringspot', scientific: 'Odontoglossum ringspot virus (ORSV)' },
      { common: 'Petal Blight', scientific: 'Botrytis cinerea' }
    ],
    'Carnation': [
      { common: 'Fusarium Wilt', scientific: 'Fusarium oxysporum f.sp. dianthi' },
      { common: 'Bacterial Wilt', scientific: 'Burkholderia caryophylli' },
      { common: 'Rust', scientific: 'Uromyces dianthi' },
      { common: 'Alternaria Blight', scientific: 'Alternaria dianthi' },
      { common: 'Botrytis Flower Rot', scientific: 'Botrytis cinerea' },
      { common: 'Stem Rot', scientific: 'Rhizoctonia solani' },
      { common: 'Fairy Ring Spot', scientific: 'Cladosporium echinulatum' },
      { common: 'Carnation Mottle', scientific: 'Carnation mottle virus (CarMV)' },
      { common: 'Powdery Mildew', scientific: 'Oidium dianthi' }
    ],
    'Areca Nut': [
      { common: 'Koleroga / Mahali (Fruit Rot)', scientific: 'Phytophthora arecae' },
      { common: 'Foot Rot (Anabe Roga)', scientific: 'Ganoderma lucidum' },
      { common: 'Yellow Leaf Disease', scientific: 'Phytoplasma' },
      { common: 'Bud Rot', scientific: 'Phytophthora palmivora' },
      { common: 'Inflorescence Dieback', scientific: 'Colletotrichum gloeosporioides' },
      { common: 'Stem Bleeding', scientific: 'Thielaviopsis paradoxa' },
      { common: 'Leaf Spot', scientific: 'Pestalotiopsis palmarum' }
    ],
    'Coffee': [
      { common: 'Coffee Leaf Rust', scientific: 'Hemileia vastatrix' },
      { common: 'Brown Eye Spot', scientific: 'Cercospora coffeicola' },
      { common: 'Black Rot (Koleroga)', scientific: 'Koleroga noxia' },
      { common: 'Coffee Berry Disease', scientific: 'Colletotrichum kahawae' },
      { common: 'Bacterial Blight (Elgon Dieback)', scientific: 'Pseudomonas syringae pv. garcae' },
      { common: 'Root Rot', scientific: 'Rosellinia spp.' },
      { common: 'Sooty Mould', scientific: 'Capnodium spp.' }
    ],
    'Tea': [
      { common: 'Blister Blight', scientific: 'Exobasidium vexans' },
      { common: 'Grey Blight', scientific: 'Pestalotiopsis theae' },
      { common: 'Brown Blight', scientific: 'Colletotrichum camelliae' },
      { common: 'Red Rust', scientific: 'Cephaleuros parasiticus' },
      { common: 'Black Rot', scientific: 'Corticium invisum' },
      { common: 'Charcoal Stump Rot', scientific: 'Ustulina zonata' },
      { common: 'Die Back', scientific: 'Colletotrichum spp.' },
      { common: 'Branch Canker', scientific: 'Macrophoma theicola' }
    ],
    'Rubber': [
      { common: 'Abnormal Leaf Fall', scientific: 'Phytophthora meadii' },
      { common: 'Powdery Mildew', scientific: 'Oidium heveae' },
      { common: 'Pink Disease', scientific: 'Erythricium salmonicolor' },
      { common: 'Corynespora Leaf Fall', scientific: 'Corynespora cassiicola' },
      { common: 'Bird Eye Spot', scientific: 'Drechslera heveae' },
      { common: 'Colletotrichum Leaf Disease', scientific: 'Colletotrichum gloeosporioides' },
      { common: 'Patch Canker', scientific: 'Phytophthora palmivora' },
      { common: 'White Root Disease', scientific: 'Rigidoporus microporus' },
      { common: 'Brown Root Disease', scientific: 'Phellinus noxius' }
    ],
    'Aloe Vera': [
      { common: 'Leaf Spot', scientific: 'Alternaria alternata' },
      { common: 'Anthracnose', scientific: 'Colletotrichum gloeosporioides' },
      { common: 'Basal Stem Rot', scientific: 'Sclerotium rolfsii' },
      { common: 'Root Rot', scientific: 'Pythium spp.' },
      { common: 'Soft Rot', scientific: 'Pectobacterium carotovorum' },
      { common: 'Rust', scientific: 'Uromyces aloes' }
    ],
    'Tulsi': [
      { common: 'Damping Off', scientific: 'Pythium spp.' },
      { common: 'Powdery Mildew', scientific: 'Oidium spp.' },
      { common: 'Root Rot', scientific: 'Rhizoctonia solani' },
      { common: 'Leaf Spot', scientific: 'Cercospora / Alternaria spp.' },
      { common: 'Wilt', scientific: 'Fusarium spp.' }
    ],
    'Ashwagandha': [
      { common: 'Leaf Spot', scientific: 'Alternaria alternata' },
      { common: 'Damping Off', scientific: 'Pythium aphanidermatum' },
      { common: 'Wilt', scientific: 'Fusarium solani' },
      { common: 'Root Rot', scientific: 'Rhizoctonia solani' },
      { common: 'Leaf Blight', scientific: 'Alternaria spp.' }
    ],
    'Brahmi': [
      { common: 'Leaf Spot', scientific: 'Cercospora spp.' },
      { common: 'Root Rot', scientific: 'Pythium spp.' },
      { common: 'Damping Off', scientific: 'Pythium / Rhizoctonia spp.' },
      { common: 'Soft Rot', scientific: 'Pectobacterium carotovorum' }
    ],
    'Neem': [
      { common: 'Dieback / Blight', scientific: 'Phomopsis azadirachtae' },
      { common: 'Leaf Spot', scientific: 'Pseudocercospora subsessilis' },
      { common: 'Powdery Mildew', scientific: 'Oidium azadirachtae' },
      { common: 'Root Rot', scientific: 'Ganoderma lucidum' },
      { common: 'Seedling Blight', scientific: 'Rhizoctonia solani' },
      { common: 'Sooty Mould', scientific: 'Capnodium spp.' }
    ],
    'Papaya': [
      { common: 'Papaya Ringspot', scientific: 'Papaya ringspot virus (PRSV)' },
      { common: 'Leaf Curl', scientific: 'Papaya leaf curl virus' },
      { common: 'Anthracnose', scientific: 'Colletotrichum gloeosporioides' },
      { common: 'Foot Rot / Collar Rot', scientific: 'Phytophthora palmivora' },
      { common: 'Powdery Mildew', scientific: 'Oidium caricae' },
      { common: 'Damping Off', scientific: 'Pythium aphanidermatum' },
      { common: 'Black Spot', scientific: 'Asperisporium caricae' },
      { common: 'Bunchy Top', scientific: 'Phytoplasma' },
      { common: 'Fruit Rot', scientific: 'Botryodiplodia theobromae' },
      { common: 'Mosaic', scientific: 'Papaya mosaic virus' }
    ]
  };

  const pestData = {
    'Coconut': [
      { common: 'Rhinoceros Beetle', scientific: 'Oryctes rhinoceros' },
      { common: 'Red Palm Weevil', scientific: 'Rhynchophorus ferrugineus' },
      { common: 'Black Headed Caterpillar', scientific: 'Nephantis serinopa' },
      { common: 'Slug Caterpillar', scientific: 'Parasa lepida' },
      { common: 'Coconut Eriophyid Mite', scientific: 'Aceria guerreronis' },
      { common: 'Coreid Bug', scientific: 'Leptocorisa acuta' },
      { common: 'Termites', scientific: 'Odontotermes spp.' },
      { common: 'Coconut Scale', scientific: 'Aspidiotus destructor' },
      { common: 'Mealy Bug', scientific: 'Pseudococcus spp.' },
      { common: 'White Fly', scientific: 'Aleurodicus spp.' },
      { common: 'Leaf Eating Caterpillar', scientific: 'Opisina arenosella' },
      { common: 'Ash Weevil', scientific: 'Myllocerus spp.' },
      { common: 'Leaf Roller', scientific: 'Omiodes blackburni' },
      { common: 'Coconut Hispid', scientific: 'Brontispa longissima' },
      { common: 'Root Grub', scientific: 'Leucopholis coneophora' },
      { common: 'Coconut Bug', scientific: 'Pseudotheraptus wayi' },
      { common: 'Coconut Flat Moth', scientific: 'Agonoxena argaula' },
      { common: 'Coconut Leafhopper', scientific: 'Proutista moesta' },
      { common: 'Coconut Aphid', scientific: 'Cerataphis lataniae' },
      { common: 'Coconut Whitefly', scientific: 'Aleurodicus destructor' }
    ],
    'Cashew': [
      { common: 'Tea Mosquito Bug', scientific: 'Helopeltis antonii' },
      { common: 'Stem and Root Borer', scientific: 'Plocaederus ferrugineus' },
      { common: 'Leaf Miner', scientific: 'Acrocercops syngramma' },
      { common: 'Apple and Nut Borer', scientific: 'Thylocopteryx anacardii' },
      { common: 'Thrips', scientific: 'Scirtothrips dorsalis' },
      { common: 'Aphids', scientific: 'Aphis gossypii' },
      { common: 'Leaf and Blossom Webber', scientific: 'Lamida moncusalis' },
      { common: 'Mealy Bugs', scientific: 'Ferrisia virgata' },
      { common: 'Shoot Tip Borer', scientific: 'Hypatima spp.' },
      { common: 'Bark Eating Caterpillar', scientific: 'Indarbela spp.' },
      { common: 'Leaf Roller', scientific: 'Tortricidae' },
      { common: 'Scale Insects', scientific: 'Ceroplastes spp.' },
      { common: 'Fruit Fly', scientific: 'Bactrocera spp.' },
      { common: 'White Fly', scientific: 'Bemisia tabaci' },
      { common: 'Stem Borer', scientific: 'Plocaederus obesus' },
      { common: 'Leaf Eating Caterpillar', scientific: 'Spodoptera litura' },
      { common: 'Cashew Flea Beetle', scientific: 'Altica cyanea' },
      { common: 'Root Borer', scientific: 'Plocaederus ferrugineus' },
      { common: 'Leaf Hopper', scientific: 'Amritodus atkinsoni' },
      { common: 'Nut Weevil', scientific: 'Curculio spp.' }
    ],
    'Tomato': [
      { common: 'Fruit Borer', scientific: 'Helicoverpa armigera' },
      { common: 'Leaf Miner', scientific: 'Liriomyza trifolii' },
      { common: 'Whitefly', scientific: 'Bemisia tabaci' },
      { common: 'Aphids', scientific: 'Aphis gossypii/Myzus persicae' },
      { common: 'Thrips', scientific: 'Thrips tabaci/Frankliniella schultzei' },
      { common: 'Root Knot Nematode', scientific: 'Meloidogyne incognita' },
      { common: 'Cutworm', scientific: 'Agrotis ipsilon' },
      { common: 'Tomato Hornworm', scientific: 'Manduca quinquemaculata' },
      { common: 'Spider Mites', scientific: 'Tetranychus urticae' },
      { common: 'Jassids', scientific: 'Amrasca biguttula' },
      { common: 'Tomato Psyllid', scientific: 'Bactericera cockerelli' },
      { common: 'Tomato Pinworm', scientific: 'Keiferia lycopersicella' },
      { common: 'Armyworm', scientific: 'Spodoptera exigua' },
      { common: 'Leaf Hopper', scientific: 'Empoasca fabae' },
      { common: 'Flea Beetle', scientific: 'Epitrix spp.' },
      { common: 'Stink Bug', scientific: 'Nezara viridula' },
      { common: 'Colorado Potato Beetle', scientific: 'Leptinotarsa decemlineata' },
      { common: 'Tomato Fruitworm', scientific: 'Helicoverpa zea' },
      { common: 'Blister Beetle', scientific: 'Epicauta spp.' },
      { common: 'Mealybug', scientific: 'Phenacoccus solenopsis' }
    ],
    'Potato': [
      { common: 'Potato Tuber Moth', scientific: 'Phthorimaea operculella' },
      { common: 'Aphids', scientific: 'Myzus persicae' },
      { common: 'Leaf Hopper', scientific: 'Empoasca fabae' },
      { common: 'Colorado Potato Beetle', scientific: 'Leptinotarsa decemlineata' },
      { common: 'Cutworm', scientific: 'Agrotis spp.' },
      { common: 'Wireworm', scientific: 'Agriotes spp.' },
      { common: 'White Grub', scientific: 'Holotrichia consanguinea' },
      { common: 'Whitefly', scientific: 'Bemisia tabaci' },
      { common: 'Thrips', scientific: 'Thrips tabaci' },
      { common: 'Potato Cyst Nematode', scientific: 'Globodera rostochiensis' },
      { common: 'Flea Beetle', scientific: 'Epitrix cucumeris' },
      { common: 'Potato Psyllid', scientific: 'Bactericera cockerelli' },
      { common: 'European Corn Borer', scientific: 'Ostrinia nubilalis' },
      { common: 'Armyworm', scientific: 'Spodoptera litura' },
      { common: 'Green Peach Aphid', scientific: 'Myzus persicae' },
      { common: 'Stink Bug', scientific: 'Nezara viridula' },
      { common: 'Blister Beetle', scientific: 'Epicauta spp.' },
      { common: 'Root Knot Nematode', scientific: 'Meloidogyne spp.' },
      { common: 'Spider Mites', scientific: 'Tetranychus urticae' },
      { common: 'Tobacco Hornworm', scientific: 'Manduca sexta' }
    ],
    'Mango': [
      { common: 'Mango Hopper', scientific: 'Amritodus atkinsoni/Idioscopus spp.' },
      { common: 'Fruit Fly', scientific: 'Bactrocera dorsalis' },
      { common: 'Mealy Bug', scientific: 'Drosicha mangiferae' },
      { common: 'Stem Borer', scientific: 'Batocera rufomaculata' },
      { common: 'Leaf Webber', scientific: 'Orthaga exvinacea' },
      { common: 'Stone Weevil', scientific: 'Sternochetus mangiferae' },
      { common: 'Leaf Gall', scientific: 'Eriophyes mangiferae' },
      { common: 'Scale Insects', scientific: 'Aulacaspis tubercularis' },
      { common: 'Shoot Borer', scientific: 'Chlumetia transversa' },
      { common: 'Thrips', scientific: 'Scirtothrips dorsalis' },
      { common: 'Blossom Midge', scientific: 'Erosomyia indica' },
      { common: 'Leaf Hopper', scientific: 'Idioscopus clypealis' },
      { common: 'Nut Weevil', scientific: 'Sternochetus frigidus' },
      { common: 'Bark Eating Caterpillar', scientific: 'Indarbela quadrinotata' },
      { common: 'Leaf Cutting Weevil', scientific: 'Deporaus marginatus' },
      { common: 'Red Banded Thrips', scientific: 'Selenothrips rubrocinctus' },
      { common: 'Aphids', scientific: 'Aphis gossypii' },
      { common: 'Fruit Sucking Moth', scientific: 'Eudocima phalonia' },
      { common: 'Mango Psyllid', scientific: 'Apsylla cistellata' },
      { common: 'Whitefly', scientific: 'Dialeurodes citri' }
    ],
    'Banana': [
      { common: 'Banana Weevil', scientific: 'Cosmopolites sordidus' },
      { common: 'Aphids', scientific: 'Pentalonia nigronervosa' },
      { common: 'Thrips', scientific: 'Chaetanaphothrips signipennis' },
      { common: 'Mealy Bug', scientific: 'Pseudococcus spp.' },
      { common: 'Scarring Beetle', scientific: 'Basilepta subcostatum' },
      { common: 'Rhizome Weevil', scientific: 'Cosmopolites sordidus' },
      { common: 'Pseudostem Weevil', scientific: 'Odoiporus longicollis' },
      { common: 'Nematodes', scientific: 'Radopholus similis' },
      { common: 'Banana Skipper', scientific: 'Erionota thrax' },
      { common: 'Scale Insects', scientific: 'Aspidiotus destructor' },
      { common: 'Banana Scab Moth', scientific: 'Nacoleia octasema' },
      { common: 'Banana Stem Weevil', scientific: 'Odoiporus longicollis' },
      { common: 'Banana Rust Thrips', scientific: 'Chaetanaphothrips orchidii' },
      { common: 'Root Borer', scientific: 'Cosmopolites sordidus' },
      { common: 'Leaf Beetle', scientific: 'Nodostoma viridipennis' },
      { common: 'Fruit Scarring Beetle', scientific: 'Colaspoides spp.' },
      { common: 'Red Spider Mite', scientific: 'Tetranychus spp.' },
      { common: 'Banana Aphid', scientific: 'Pentalonia caladii' },
      { common: 'Corm Weevil', scientific: 'Cosmopolites sordidus' },
      { common: 'Banana Moth', scientific: 'Opogona sacchari' }
    ],
    'Rose': [
      { common: 'Aphids', scientific: 'Macrosiphum rosae' },
      { common: 'Thrips', scientific: 'Frankliniella occidentalis' },
      { common: 'Japanese Beetle', scientific: 'Popillia japonica' },
      { common: 'Rose Slug', scientific: 'Endelomyia aethiops' },
      { common: 'Spider Mites', scientific: 'Tetranychus urticae' },
      { common: 'Leaf Cutter Bee', scientific: 'Megachile spp.' },
      { common: 'Rose Chafer', scientific: 'Macrodactylus subspinosus' },
      { common: 'Scale Insects', scientific: 'Aulacaspis rosae' },
      { common: 'Rose Midge', scientific: 'Dasineura rhodophaga' },
      { common: 'Whitefly', scientific: 'Trialeurodes vaporariorum' },
      { common: 'Rose Leafhopper', scientific: 'Edwardsiana rosae' },
      { common: 'Fuller Rose Beetle', scientific: 'Naupactus godmanni' },
      { common: 'Rose Stem Girdler', scientific: 'Agrilus aurichalceus' },
      { common: 'Rose Curculio', scientific: 'Merhynchites bicolor' },
      { common: 'Cane Borer', scientific: 'Oberea bimaculata' },
      { common: 'Mealy Bug', scientific: 'Pseudococcus longispinus' },
      { common: 'Rose Sawfly', scientific: 'Arge rosae' },
      { common: 'Caterpillars', scientific: 'Spodoptera spp.' },
      { common: 'Root Knot Nematode', scientific: 'Meloidogyne spp.' },
      { common: 'Rose Flea Beetle', scientific: 'Altica rosae' }
    ],
    'Chili': [
      { common: 'Thrips', scientific: 'Scirtothrips dorsalis' },
      { common: 'Fruit Borer', scientific: 'Helicoverpa armigera' },
      { common: 'Aphids', scientific: 'Aphis gossypii' },
      { common: 'Mites', scientific: 'Polyphagotarsonemus latus' },
      { common: 'Whitefly', scientific: 'Bemisia tabaci' },
      { common: 'Leaf Curl Mite', scientific: 'Aceria chilli' },
      { common: 'Root Knot Nematode', scientific: 'Meloidogyne incognita' },
      { common: 'Cutworm', scientific: 'Agrotis ipsilon' },
      { common: 'Stem Borer', scientific: 'Euzophera perticella' },
      { common: 'Leaf Eating Caterpillar', scientific: 'Spodoptera litura' },
      { common: 'Tobacco Caterpillar', scientific: 'Spodoptera litura' },
      { common: 'Leaf Hopper', scientific: 'Amrasca biguttula' },
      { common: 'Jassids', scientific: 'Empoasca kerri' },
      { common: 'Capsule Borer', scientific: 'Heliothis armigera' },
      { common: 'Flea Beetle', scientific: 'Epitrix spp.' },
      { common: 'Stink Bug', scientific: 'Nezara viridula' },
      { common: 'Spider Mites', scientific: 'Tetranychus urticae' },
      { common: 'Blossom Midge', scientific: 'Contarinia spp.' },
      { common: 'Gall Midge', scientific: 'Asphondylia capsici' },
      { common: 'Pepper Weevil', scientific: 'Anthonomus eugenii' }
    ],
    'Brinjal': [
      { common: 'Shoot & Fruit Borer', scientific: 'Leucinodes orbonalis' },
      { common: 'Jassid', scientific: 'Amrasca biguttula biguttula' },
      { common: 'Whitefly', scientific: 'Bemisia tabaci' },
      { common: 'Epilachna Beetle', scientific: 'Henosepilachna vigintioctopunctata' },
      { common: 'Aphid', scientific: 'Aphis gossypii' },
      { common: 'Mealybug', scientific: 'Coccidohystrix insolita' },
      { common: 'Red Spider Mite', scientific: 'Tetranychus urticae' },
      { common: 'Lace Bug', scientific: 'Urentius hystricellus' },
      { common: 'Stem Borer', scientific: 'Euzophera perticella' },
      { common: 'Thrips', scientific: 'Scirtothrips dorsalis' },
      { common: 'Root Knot Nematode', scientific: 'Meloidogyne incognita' }
    ],
    'Okra': [
      { common: 'Fruit & Shoot Borer', scientific: 'Earias vittella' },
      { common: 'Jassid', scientific: 'Amrasca biguttula biguttula' },
      { common: 'Whitefly', scientific: 'Bemisia tabaci' },
      { common: 'Aphid', scientific: 'Aphis gossypii' },
      { common: 'Red Cotton Bug', scientific: 'Dysdercus cingulatus' },
      { common: 'Spotted Bollworm', scientific: 'Earias insulana' },
      { common: 'Leafhopper', scientific: 'Amrasca devastans' },
      { common: 'Red Spider Mite', scientific: 'Tetranychus urticae' },
      { common: 'Thrips', scientific: 'Thrips tabaci' },
      { common: 'Root Knot Nematode', scientific: 'Meloidogyne incognita' }
    ],
    'Onion': [
      { common: 'Thrips', scientific: 'Thrips tabaci' },
      { common: 'Onion Maggot', scientific: 'Delia antiqua' },
      { common: 'Eriophyid Mite', scientific: 'Aceria tulipae' },
      { common: 'Cutworm', scientific: 'Agrotis ipsilon' },
      { common: 'Armyworm', scientific: 'Spodoptera exigua' },
      { common: 'Leaf Eating Caterpillar', scientific: 'Spodoptera litura' }
    ],
    'Cabbage': [
      { common: 'Diamondback Moth', scientific: 'Plutella xylostella' },
      { common: 'Cabbage Butterfly', scientific: 'Pieris brassicae' },
      { common: 'Tobacco Caterpillar', scientific: 'Spodoptera litura' },
      { common: 'Cabbage Aphid', scientific: 'Brevicoryne brassicae' },
      { common: 'Cabbage Webworm', scientific: 'Hellula undalis' },
      { common: 'Leaf Webber', scientific: 'Crocidolomia binotalis' },
      { common: 'Painted Bug', scientific: 'Bagrada hilaris' },
      { common: 'Semilooper', scientific: 'Trichoplusia ni' }
    ],
    'Cauliflower': [
      { common: 'Diamondback Moth', scientific: 'Plutella xylostella' },
      { common: 'Cabbage Butterfly', scientific: 'Pieris brassicae' },
      { common: 'Cabbage Aphid', scientific: 'Brevicoryne brassicae' },
      { common: 'Tobacco Caterpillar', scientific: 'Spodoptera litura' },
      { common: 'Leaf Webber', scientific: 'Crocidolomia binotalis' },
      { common: 'Painted Bug', scientific: 'Bagrada hilaris' },
      { common: 'Cabbage Borer', scientific: 'Hellula undalis' }
    ],
    'Beans': [
      { common: 'Pod Borer', scientific: 'Maruca vitrata' },
      { common: 'Aphid', scientific: 'Aphis craccivora' },
      { common: 'Whitefly', scientific: 'Bemisia tabaci' },
      { common: 'Bean Fly (Stem Fly)', scientific: 'Ophiomyia phaseoli' },
      { common: 'Jassid', scientific: 'Empoasca kerri' },
      { common: 'Hairy Caterpillar', scientific: 'Spilarctia obliqua' },
      { common: 'Red Spider Mite', scientific: 'Tetranychus urticae' },
      { common: 'Thrips', scientific: 'Megalurothrips distalis' }
    ],
    'Apple': [
      { common: 'Codling Moth', scientific: 'Cydia pomonella' },
      { common: 'San Jose Scale', scientific: 'Quadraspidiotus perniciosus' },
      { common: 'Woolly Apple Aphid', scientific: 'Eriosoma lanigerum' },
      { common: 'Green Apple Aphid', scientific: 'Aphis pomi' },
      { common: 'European Red Mite', scientific: 'Panonychus ulmi' },
      { common: 'Tent Caterpillar', scientific: 'Malacosoma indica' },
      { common: 'Stem Borer', scientific: 'Aeolesthes holosericea' },
      { common: 'Leaf Roller', scientific: 'Archips spp.' }
    ],
    'Orange': [
      { common: 'Citrus Psylla', scientific: 'Diaphorina citri' },
      { common: 'Citrus Leaf Miner', scientific: 'Phyllocnistis citrella' },
      { common: 'Fruit Sucking Moth', scientific: 'Eudocima spp.' },
      { common: 'Citrus Blackfly', scientific: 'Aleurocanthus woglumi' },
      { common: 'Brown Citrus Aphid', scientific: 'Toxoptera citricidus' },
      { common: 'Citrus Mealybug', scientific: 'Planococcus citri' },
      { common: 'California Red Scale', scientific: 'Aonidiella aurantii' },
      { common: 'Fruit Fly', scientific: 'Bactrocera dorsalis' },
      { common: 'Bark Eating Caterpillar', scientific: 'Indarbela tetraonis' },
      { common: 'Citrus Mite', scientific: 'Eutetranychus orientalis' }
    ],
    'Grapes': [
      { common: 'Flea Beetle', scientific: 'Scelodonta strigicollis' },
      { common: 'Thrips', scientific: 'Rhipiphorothrips cruentatus' },
      { common: 'Mealybug', scientific: 'Maconellicoccus hirsutus' },
      { common: 'Leafhopper', scientific: 'Arboridia spp.' },
      { common: 'Stem Borer', scientific: 'Celosterna scabrator' },
      { common: 'Red Spider Mite', scientific: 'Tetranychus urticae' },
      { common: 'Leaf Eating Caterpillar', scientific: 'Spodoptera litura' }
    ],
    'Guava': [
      { common: 'Fruit Fly', scientific: 'Bactrocera dorsalis' },
      { common: 'Mealybug', scientific: 'Ferrisia virgata' },
      { common: 'Tea Mosquito Bug', scientific: 'Helopeltis antonii' },
      { common: 'Bark Eating Caterpillar', scientific: 'Indarbela tetraonis' },
      { common: 'Green Shield Scale', scientific: 'Chloropulvinaria psidii' },
      { common: 'Aphid', scientific: 'Aphis gossypii' },
      { common: 'Whitefly', scientific: 'Aleurodicus dispersus' }
    ],
    'Pomegranate': [
      { common: 'Fruit Borer (Anar Butterfly)', scientific: 'Deudorix isocrates' },
      { common: 'Aphid', scientific: 'Aphis punicae' },
      { common: 'Thrips', scientific: 'Scirtothrips dorsalis' },
      { common: 'Mealybug', scientific: 'Planococcus citri' },
      { common: 'Whitefly', scientific: 'Siphoninus phillyreae' },
      { common: 'Bark Eating Caterpillar', scientific: 'Indarbela tetraonis' },
      { common: 'Stem Borer', scientific: 'Coelosterna spinator' },
      { common: 'Mite', scientific: 'Tetranychus spp.' }
    ],
    'Turmeric': [
      { common: 'Shoot Borer', scientific: 'Conogethes punctiferalis' },
      { common: 'Rhizome Scale', scientific: 'Aspidiella hartii' },
      { common: 'Leaf Roller', scientific: 'Udaspes folus' },
      { common: 'Rhizome Fly', scientific: 'Mimegralla coeruleifrons' },
      { common: 'Thrips', scientific: 'Panchaetothrips indicus' },
      { common: 'Root Grub', scientific: 'Holotrichia spp.' }
    ],
    'Ginger': [
      { common: 'Shoot Borer', scientific: 'Conogethes punctiferalis' },
      { common: 'Rhizome Scale', scientific: 'Aspidiella hartii' },
      { common: 'Leaf Roller', scientific: 'Udaspes folus' },
      { common: 'Rhizome Fly', scientific: 'Mimegralla coeruleifrons' },
      { common: 'White Grub', scientific: 'Holotrichia spp.' },
      { common: 'Root Knot Nematode', scientific: 'Meloidogyne incognita' }
    ],
    'Cardamom': [
      { common: 'Thrips', scientific: 'Sciothrips cardamomi' },
      { common: 'Shoot/Capsule/Panicle Borer', scientific: 'Conogethes punctiferalis' },
      { common: 'Root Grub', scientific: 'Basilepta fulvicorne' },
      { common: 'Whitefly', scientific: 'Kanakarajiella cardamomi' },
      { common: 'Hairy Caterpillar', scientific: 'Eupterote spp.' },
      { common: 'Lacewing Bug', scientific: 'Stephanitis typica' }
    ],
    'Pepper': [
      { common: 'Pollu Beetle', scientific: 'Longitarsus nigripennis' },
      { common: 'Top Shoot Borer', scientific: 'Cydia hemidoxa' },
      { common: 'Marginal Gall Thrips', scientific: 'Liothrips karnyi' },
      { common: 'Scale Insect', scientific: 'Aspidiotus destructor' },
      { common: 'Mealybug', scientific: 'Planococcus citri' },
      { common: 'Leaf Gall Thrips', scientific: 'Liothrips karnyi' }
    ],
    'Coriander': [
      { common: 'Coriander Aphid', scientific: 'Hyadaphis coriandri' },
      { common: 'Green Peach Aphid', scientific: 'Myzus persicae' },
      { common: 'Whitefly', scientific: 'Bemisia tabaci' },
      { common: 'Cutworm', scientific: 'Agrotis ipsilon' },
      { common: 'Thrips', scientific: 'Thrips tabaci' }
    ],
    'Marigold': [
      { common: 'Tobacco Caterpillar', scientific: 'Spodoptera litura' },
      { common: 'Bud Borer', scientific: 'Helicoverpa armigera' },
      { common: 'Red Spider Mite', scientific: 'Tetranychus urticae' },
      { common: 'Leafhopper', scientific: 'Empoasca spp.' },
      { common: 'Thrips', scientific: 'Thrips tabaci' },
      { common: 'Aphid', scientific: 'Aphis gossypii' },
      { common: 'Hairy Caterpillar', scientific: 'Spilarctia obliqua' }
    ],
    'Jasmine': [
      { common: 'Budworm', scientific: 'Hendecasis duplifascialis' },
      { common: 'Blossom Midge', scientific: 'Contarinia maculipennis' },
      { common: 'Leaf Webber', scientific: 'Nausinoe geometralis' },
      { common: 'Gallery Worm', scientific: 'Elasmopalpus jasminophagus' },
      { common: 'Red Spider Mite', scientific: 'Tetranychus urticae' },
      { common: 'Eriophyid Mite', scientific: 'Aceria jasmini' },
      { common: 'Whitefly', scientific: 'Dialeurodes kirkaldyi' }
    ],
    'Chrysanthemum': [
      { common: 'Aphid', scientific: 'Macrosiphoniella sanborni' },
      { common: 'Thrips', scientific: 'Frankliniella occidentalis' },
      { common: 'Leaf Miner', scientific: 'Liriomyza trifolii' },
      { common: 'Red Spider Mite', scientific: 'Tetranychus urticae' },
      { common: 'Capitulum Borer', scientific: 'Helicoverpa armigera' },
      { common: 'Tobacco Caterpillar', scientific: 'Spodoptera litura' },
      { common: 'Whitefly', scientific: 'Trialeurodes vaporariorum' }
    ],
    'Orchid': [
      { common: 'Boisduval Scale', scientific: 'Diaspis boisduvalii' },
      { common: 'Mealybug', scientific: 'Pseudococcus longispinus' },
      { common: 'Orchid Thrips', scientific: 'Dichromothrips corbetti' },
      { common: 'Red Spider Mite', scientific: 'Tetranychus urticae' },
      { common: 'Orchid Weevil', scientific: 'Orchidophilus aterrimus' },
      { common: 'Snails & Slugs', scientific: 'Various Gastropoda' },
      { common: 'Aphid', scientific: 'Cerataphis orchidearum' }
    ],
    'Carnation': [
      { common: 'Thrips', scientific: 'Frankliniella occidentalis' },
      { common: 'Aphid', scientific: 'Myzus persicae' },
      { common: 'Red Spider Mite', scientific: 'Tetranychus urticae' },
      { common: 'Whitefly', scientific: 'Trialeurodes vaporariorum' },
      { common: 'Bud Borer', scientific: 'Helicoverpa armigera' },
      { common: 'Leaf Miner', scientific: 'Liriomyza trifolii' },
      { common: 'Cutworm', scientific: 'Agrotis ipsilon' }
    ],
    'Areca Nut': [
      { common: 'Spindle Bug', scientific: 'Carvalhoia arecae' },
      { common: 'Root Grub', scientific: 'Leucopholis coneophora' },
      { common: 'Inflorescence Caterpillar', scientific: 'Tirathaba spp.' },
      { common: 'Red Palm Mite', scientific: 'Raoiella indica' },
      { common: 'Pentatomid Bug', scientific: 'Halyomorpha spp.' },
      { common: 'Scale Insect', scientific: 'Aspidiotus destructor' },
      { common: 'Nut Borer', scientific: 'Conogethes punctiferalis' }
    ],
    'Coffee': [
      { common: 'White Stem Borer', scientific: 'Xylotrechus quadripes' },
      { common: 'Coffee Berry Borer', scientific: 'Hypothenemus hampei' },
      { common: 'Shot Hole Borer', scientific: 'Xylosandrus compactus' },
      { common: 'Green Scale', scientific: 'Coccus viridis' },
      { common: 'Mealybug', scientific: 'Planococcus citri' },
      { common: 'Brown Scale', scientific: 'Saissetia coffeae' },
      { common: 'Hairy Caterpillar', scientific: 'Eupterote spp.' }
    ],
    'Tea': [
      { common: 'Tea Mosquito Bug', scientific: 'Helopeltis theivora' },
      { common: 'Red Spider Mite', scientific: 'Oligonychus coffeae' },
      { common: 'Thrips', scientific: 'Scirtothrips dorsalis' },
      { common: 'Tea Looper', scientific: 'Biston suppressaria' },
      { common: 'Tea Aphid', scientific: 'Toxoptera aurantii' },
      { common: 'Shot Hole Borer', scientific: 'Euwallacea fornicatus' },
      { common: 'Flushworm', scientific: 'Cydia leucostoma' },
      { common: 'Scale Insect', scientific: 'Saissetia coffeae' }
    ],
    'Rubber': [
      { common: 'Scale Insect', scientific: 'Saissetia nigra' },
      { common: 'Mealybug', scientific: 'Ferrisia virgata' },
      { common: 'Mite', scientific: 'Tetranychus spp.' },
      { common: 'Cockchafer Grub', scientific: 'Holotrichia spp.' },
      { common: 'Termites', scientific: 'Odontotermes spp.' }
    ],
    'Aloe Vera': [
      { common: 'Mealybug', scientific: 'Pseudococcus longispinus' },
      { common: 'Aphid', scientific: 'Aphis gossypii' },
      { common: 'Scale Insect', scientific: 'Aspidiotus destructor' },
      { common: 'Termites', scientific: 'Odontotermes spp.' },
      { common: 'Mite', scientific: 'Tetranychus spp.' }
    ],
    'Tulsi': [
      { common: 'Leaf Roller', scientific: 'Syngamia abruptalis' },
      { common: 'Aphid', scientific: 'Aphis gossypii' },
      { common: 'Whitefly', scientific: 'Bemisia tabaci' },
      { common: 'Lace Bug', scientific: 'Cochlochila bullita' },
      { common: 'Leaf Eating Caterpillar', scientific: 'Spodoptera litura' },
      { common: 'Mealybug', scientific: 'Phenacoccus solenopsis' }
    ],
    'Ashwagandha': [
      { common: 'Carmine Mite', scientific: 'Tetranychus cinnabarinus' },
      { common: 'Aphid', scientific: 'Aphis gossypii' },
      { common: 'Whitefly', scientific: 'Bemisia tabaci' },
      { common: 'Epilachna Beetle', scientific: 'Henosepilachna vigintioctopunctata' },
      { common: 'Hairy Caterpillar', scientific: 'Spilarctia obliqua' },
      { common: 'Mealybug', scientific: 'Phenacoccus solenopsis' }
    ],
    'Brahmi': [
      { common: 'Aphid', scientific: 'Aphis gossypii' },
      { common: 'Whitefly', scientific: 'Bemisia tabaci' },
      { common: 'Leaf Eating Caterpillar', scientific: 'Spodoptera litura' },
      { common: 'Grasshopper', scientific: 'Acrida spp.' },
      { common: 'Mite', scientific: 'Tetranychus spp.' }
    ],
    'Neem': [
      { common: 'Tea Mosquito Bug', scientific: 'Helopeltis antonii' },
      { common: 'Oriental Scale', scientific: 'Aonidiella orientalis' },
      { common: 'Leaf Webber / Defoliator', scientific: 'Boarmia variegata' },
      { common: 'Aphid', scientific: 'Aphis gossypii' },
      { common: 'Whitefly', scientific: 'Bemisia tabaci' },
      { common: 'Mealybug', scientific: 'Planococcus citri' }
    ],
    'Papaya': [
      { common: 'Papaya Mealybug', scientific: 'Paracoccus marginatus' },
      { common: 'Aphid (PRSV vector)', scientific: 'Aphis gossypii' },
      { common: 'Fruit Fly', scientific: 'Bactrocera dorsalis' },
      { common: 'Red Spider Mite', scientific: 'Tetranychus cinnabarinus' },
      { common: 'Whitefly', scientific: 'Bemisia tabaci' },
      { common: 'Ash Weevil', scientific: 'Myllocerus spp.' },
      { common: 'Scale Insect', scientific: 'Aspidiotus destructor' }
    ]
  };

  // ---------- Supplementary (additional reported) diseases & pests ----------
  // Merged into the crop lists below (de-duplicated). Keeps the primary lists readable while broadening coverage.
  const extraDiseaseData = {
    Cashew: [
      { common: 'Pink Disease', scientific: 'Erythricium salmonicolor' },
      { common: 'Inflorescence Blight', scientific: 'Colletotrichum gloeosporioides' },
      { common: 'Red Rust (Algal Leaf Spot)', scientific: 'Cephaleuros virescens' },
      { common: 'Sooty Mould', scientific: 'Capnodium spp.' },
      { common: 'Damping Off', scientific: 'Rhizoctonia solani' },
      { common: 'Shoot Dieback', scientific: 'Lasiodiplodia theobromae' },
      { common: 'Twig Blight', scientific: 'Phomopsis anacardii' },
      { common: 'Grey Blight', scientific: 'Pestalotiopsis spp.' },
      { common: 'Black Mould Nut Rot', scientific: 'Aspergillus niger' },
      { common: 'Seedling Wilt', scientific: 'Fusarium spp.' }
    ],
    Mango: [
      { common: 'Sudden Death / Decline', scientific: 'Ceratocystis fimbriata' },
      { common: 'Apical Necrosis', scientific: 'Pseudomonas syringae' },
      { common: 'Grey Leaf Blight', scientific: 'Pestalotiopsis mangiferae' },
      { common: 'Charcoal Rot', scientific: 'Macrophomina phaseolina' },
      { common: 'Rhizopus Fruit Rot', scientific: 'Rhizopus stolonifer' },
      { common: 'Aspergillus Fruit Rot', scientific: 'Aspergillus niger' },
      { common: 'Mucor Rot', scientific: 'Mucor circinelloides' },
      { common: 'Twig Blight & Dieback', scientific: 'Botryosphaeria dothidea' },
      { common: 'Sclerotium Collar Rot', scientific: 'Sclerotium rolfsii' },
      { common: 'Bacterial Black Spot', scientific: 'Xanthomonas citri pv. mangiferaeindicae' }
    ],
    Banana: [
      { common: 'Eumusae Leaf Spot', scientific: 'Mycosphaerella eumusae' },
      { common: 'Cordana Leaf Spot', scientific: 'Cordana musae' },
      { common: 'Deightoniella Leaf Spot', scientific: 'Deightoniella torulosa' },
      { common: 'Pitting Disease', scientific: 'Pyricularia grisea' },
      { common: 'Cladosporium Speckle', scientific: 'Cladosporium musae' },
      { common: 'Erwinia Rhizome Rot', scientific: 'Erwinia carotovora' },
      { common: 'Fusarium Wilt TR4', scientific: 'Fusarium oxysporum f.sp. cubense TR4' },
      { common: 'Black Cross', scientific: 'Phyllachora musicola' }
    ],
    Brinjal: [
      { common: 'Phytophthora Blight', scientific: 'Phytophthora nicotianae' },
      { common: 'Bacterial Leaf Spot', scientific: 'Xanthomonas campestris pv. vesicatoria' },
      { common: 'Spotted Wilt', scientific: 'Tomato spotted wilt virus (TSWV)' },
      { common: 'Choanephora Blight', scientific: 'Choanephora cucurbitarum' },
      { common: 'Charcoal Rot', scientific: 'Macrophomina phaseolina' },
      { common: 'Ascochyta Blight', scientific: 'Ascochyta hortorum' }
    ],
    Okra: [
      { common: 'Powdery Mildew (Leveillula)', scientific: 'Leveillula taurica' },
      { common: 'Cercospora Blight', scientific: 'Cercospora malayensis' },
      { common: 'Web Blight', scientific: 'Rhizoctonia solani' },
      { common: 'Pythium Root Rot', scientific: 'Pythium aphanidermatum' },
      { common: 'Charcoal Rot', scientific: 'Macrophomina phaseolina' }
    ],
    Onion: [
      { common: 'Anthracnose (Twister)', scientific: 'Colletotrichum gloeosporioides' },
      { common: 'Botrytis Leaf Blight', scientific: 'Botrytis squamosa' },
      { common: 'Damping Off', scientific: 'Pythium spp.' },
      { common: 'Onion Yellow Dwarf', scientific: 'Onion yellow dwarf virus' }
    ],
    Cabbage: [
      { common: 'White Rust (White Blister)', scientific: 'Albugo candida' },
      { common: 'Powdery Mildew', scientific: 'Erysiphe cruciferarum' },
      { common: 'Bacterial Leaf Spot', scientific: 'Pseudomonas syringae pv. maculicola' },
      { common: 'Head Rot', scientific: 'Sclerotinia sclerotiorum' }
    ],
    Cauliflower: [
      { common: 'White Rust', scientific: 'Albugo candida' },
      { common: 'Ring Spot', scientific: 'Mycosphaerella brassicicola' },
      { common: 'Powdery Mildew', scientific: 'Erysiphe cruciferarum' }
    ],
    Beans: [
      { common: 'Cercospora Leaf Spot', scientific: 'Cercospora canescens' },
      { common: 'Charcoal Rot (Ashy Stem Blight)', scientific: 'Macrophomina phaseolina' },
      { common: 'Yellow Mosaic', scientific: 'Mungbean yellow mosaic virus' },
      { common: 'Collar Rot', scientific: 'Sclerotium rolfsii' },
      { common: 'Damping Off', scientific: 'Pythium aphanidermatum' }
    ],
    Apple: [
      { common: 'Brown Rot', scientific: 'Monilinia fructigena' },
      { common: 'Blue Mould', scientific: 'Penicillium expansum' },
      { common: 'Nectria Canker', scientific: 'Neonectria ditissima' },
      { common: 'Flyspeck', scientific: 'Schizothyrium pomi' }
    ],
    Orange: [
      { common: 'Citrus Nematode (Slow Decline)', scientific: 'Tylenchulus semipenetrans' },
      { common: 'Brown Rot of Fruit', scientific: 'Phytophthora citrophthora' },
      { common: 'Pink Disease', scientific: 'Erythricium salmonicolor' },
      { common: 'Exocortis', scientific: 'Citrus exocortis viroid' },
      { common: 'Citrus Mosaic', scientific: 'Citrus mosaic virus' }
    ],
    Grapes: [
      { common: 'Alternaria Leaf Spot', scientific: 'Alternaria alternata' },
      { common: 'Ripe Rot', scientific: 'Colletotrichum gloeosporioides' },
      { common: 'Botryosphaeria Dieback', scientific: 'Lasiodiplodia theobromae' },
      { common: 'Sour Rot', scientific: 'Aspergillus / Acetobacter complex' },
      { common: 'Cercospora Leaf Spot', scientific: 'Pseudocercospora vitis' }
    ],
    Guava: [
      { common: 'Mucor Rot', scientific: 'Mucor hiemalis' },
      { common: 'Aspergillus Fruit Rot', scientific: 'Aspergillus niger' },
      { common: 'Rhizopus Rot', scientific: 'Rhizopus stolonifer' },
      { common: 'Seedling Wilt', scientific: 'Fusarium solani' }
    ],
    Pomegranate: [
      { common: 'Phytophthora Root Rot', scientific: 'Phytophthora nicotianae' },
      { common: 'Dry Rot', scientific: 'Phomopsis aucubicola' },
      { common: 'Sooty Mould', scientific: 'Capnodium spp.' }
    ],
    Papaya: [
      { common: 'Stem Rot / Root Rot', scientific: 'Pythium aphanidermatum' },
      { common: 'Corynespora Leaf Spot', scientific: 'Corynespora cassiicola' },
      { common: 'Cercospora Leaf Spot', scientific: 'Cercospora papayae' }
    ],
    Turmeric: [
      { common: 'Storage Rot', scientific: 'Aspergillus flavus' }
    ],
    Marigold: [
      { common: 'Inflorescence Blight', scientific: 'Alternaria spp.' },
      { common: 'Sclerotium Wilt', scientific: 'Sclerotium rolfsii' }
    ],
    Jasmine: [
      { common: 'Anthracnose', scientific: 'Colletotrichum gloeosporioides' },
      { common: 'Sooty Mould', scientific: 'Capnodium spp.' }
    ],
    Chrysanthemum: [
      { common: 'Foliar Nematode', scientific: 'Aphelenchoides ritzemabosi' },
      { common: 'Verticillium Wilt', scientific: 'Verticillium dahliae' }
    ],
    Coffee: [
      { common: 'Pink Disease', scientific: 'Erythricium salmonicolor' },
      { common: 'Damping Off', scientific: 'Rhizoctonia solani' },
      { common: 'Collar Rot', scientific: 'Rhizoctonia solani' }
    ],
    Tea: [
      { common: 'Thread Blight (Horse-hair)', scientific: 'Marasmius equicrinis' },
      { common: 'Bark Canker', scientific: 'Phomopsis theae' }
    ],
    Rubber: [
      { common: 'Shoot Rot & Leaf Fall', scientific: 'Phytophthora botryosa' },
      { common: 'Tapping Panel Dryness', scientific: 'Physiological disorder' }
    ],
    'Areca Nut': [
      { common: 'Sun Scorch', scientific: 'Physiological disorder' },
      { common: 'Nut Splitting', scientific: 'Physiological disorder' }
    ],
    Neem: [
      { common: 'Twig Blight', scientific: 'Phomopsis azadirachtae' },
      { common: 'Seedling Charcoal Rot', scientific: 'Macrophomina phaseolina' }
    ],
    'Aloe Vera': [
      { common: 'Leaf Blight', scientific: 'Alternaria spp.' },
      { common: 'Stem Rot', scientific: 'Fusarium oxysporum' }
    ],
    Tulsi: [
      { common: 'Seedling Blight', scientific: 'Rhizoctonia solani' },
      { common: 'Sooty Mould', scientific: 'Capnodium spp.' }
    ],
    Ashwagandha: [
      { common: 'Choanephora Blight', scientific: 'Choanephora cucurbitarum' },
      { common: 'Stem Rot', scientific: 'Fusarium solani' }
    ],
    Brahmi: [
      { common: 'Wilt', scientific: 'Fusarium oxysporum' },
      { common: 'Anthracnose', scientific: 'Colletotrichum spp.' }
    ]
  };

  const extraPestData = {
    Cashew: [
      { common: 'Flower Thrips', scientific: 'Rhynchothrips raoensis' },
      { common: 'Hairy Caterpillar', scientific: 'Euproctis fraterna' },
      { common: 'Leaf Folder', scientific: 'Caloptilia tiselaa' }
    ],
    Mango: [
      { common: 'Mango Gall Midge', scientific: 'Procontarinia matteiana' },
      { common: 'Mango Fruit Borer', scientific: 'Deanolis sublimbalis' },
      { common: 'Inflorescence Midge', scientific: 'Dasineura amaramanjarae' }
    ],
    Banana: [
      { common: 'Lacewing / Tingid Bug', scientific: 'Stephanitis typica' },
      { common: 'Spiralling Whitefly', scientific: 'Aleurodicus dispersus' },
      { common: 'Lesion Nematode', scientific: 'Pratylenchus coffeae' },
      { common: 'Spiral Nematode', scientific: 'Helicotylenchus multicinctus' },
      { common: 'Root-knot Nematode', scientific: 'Meloidogyne incognita' }
    ],
    Brinjal: [
      { common: 'Tobacco Caterpillar', scientific: 'Spodoptera litura' }
    ],
    Okra: [
      { common: 'Mealybug', scientific: 'Phenacoccus solenopsis' },
      { common: 'Tobacco Caterpillar', scientific: 'Spodoptera litura' }
    ],
    Onion: [
      { common: 'Onion Aphid', scientific: 'Neotoxoptera formosana' },
      { common: 'Bulb Mite', scientific: 'Rhizoglyphus echinopus' }
    ],
    Cabbage: [
      { common: 'Bihar Hairy Caterpillar', scientific: 'Spilarctia obliqua' },
      { common: 'Mustard Sawfly', scientific: 'Athalia lugens proxima' },
      { common: 'Mustard Aphid', scientific: 'Lipaphis erysimi' }
    ],
    Cauliflower: [
      { common: 'Mustard Sawfly', scientific: 'Athalia lugens proxima' },
      { common: 'Bihar Hairy Caterpillar', scientific: 'Spilarctia obliqua' }
    ],
    Beans: [
      { common: 'Blue Butterfly (Pod Borer)', scientific: 'Lampides boeticus' },
      { common: 'Spotted Pod Borer', scientific: 'Maruca vitrata' }
    ],
    Apple: [
      { common: 'Blossom Thrips', scientific: 'Thrips spp.' },
      { common: 'Hairy Caterpillar', scientific: 'Euproctis spp.' }
    ],
    Orange: [
      { common: 'Lemon Butterfly', scientific: 'Papilio demoleus' },
      { common: 'Citrus Whitefly', scientific: 'Dialeurodes citri' },
      { common: 'Citrus Thrips', scientific: 'Scirtothrips citri' }
    ],
    Guava: [
      { common: 'Fruit Borer', scientific: 'Deudorix isocrates' }
    ],
    Papaya: [
      { common: 'Spiralling Whitefly', scientific: 'Aleurodicus dispersus' }
    ],
    Coffee: [
      { common: 'Hairy Caterpillar', scientific: 'Eupterote spp.' }
    ]
  };

  const mergeDedupe = (a, b) => {
    const seen = new Set();
    const out = [];
    [...a, ...b].forEach(x => {
      const k = (x.common || '').toLowerCase();
      if (k && !seen.has(k)) { seen.add(k); out.push(x); }
    });
    return out;
  };

  // ---------- Quantitative rating scales ----------
  const diseaseScales = {
    general_0_4: {
      name: '0–4 · General severity (5-point)', short: '0–4', type: 'general', grades: [0, 1, 2, 3, 4], min: 0, max: 4,
      legend: {
        0: 'No symptoms',
        1: '1–10% leaf area / tissue affected',
        2: '11–25% affected',
        3: '26–50% affected',
        4: 'More than 50% affected'
      }
    },
    viral_0_5: {
      name: '0–5 · Leaf curl / Mosaic (viral)', short: '0–5 viral', type: 'viral', grades: [0, 1, 2, 3, 4, 5], max: 5,
      legend: {
        0: 'No visible symptoms',
        1: 'Very mild curling/mosaic on a few leaves; no stunting',
        2: 'Mild curling/mottling; slight reduction in leaf size',
        3: 'Moderate curling, puckering, vein clearing; mild stunting',
        4: 'Severe curling, yellowing, distortion; pronounced stunting',
        5: 'Very severe stunting & crinkling; little or no fruit set'
      }
    },
    general_0_5: {
      name: '0–5 · General severity (6-point)', short: '0–5', type: 'general', grades: [0, 1, 2, 3, 4, 5], min: 0, max: 5,
      legend: {
        0: 'No symptoms',
        1: '1–10% leaf area / tissue affected',
        2: '11–25% affected',
        3: '26–50% affected',
        4: '51–75% affected',
        5: 'More than 75% affected'
      }
    },
    scale_1_6: {
      name: '1–6 · 6-point (1 = healthy)', short: '1–6', type: 'general', grades: [1, 2, 3, 4, 5, 6], min: 1, max: 6,
      legend: {
        1: 'No symptoms (healthy)',
        2: '1–10% affected',
        3: '11–25% affected',
        4: '26–50% affected',
        5: '51–75% affected',
        6: 'More than 75% affected'
      }
    },
    foliar_0_9: {
      name: '0–9 · Foliar diseases (leaf area)', short: '0–9 foliar', type: 'foliar', grades: [0, 1, 3, 5, 7, 9], max: 9,
      legend: {
        0: 'No symptoms',
        1: 'Up to 10% leaf area affected',
        3: '11–25% leaf area affected',
        5: '26–50% leaf area affected',
        7: '51–75% leaf area affected',
        9: 'More than 75% leaf area affected'
      }
    }
  };

  const pestScales = {
    damage_0_4: {
      name: '0–4 · Damage grade (5-point)', short: '0–4 damage', grades: [0, 1, 2, 3, 4], min: 0, max: 4,
      legend: { 0: 'No damage', 1: '1–10% damage', 2: '11–25% damage', 3: '26–50% damage', 4: 'More than 50% damage' }
    },
    damage_0_5: {
      name: '0–5 · Damage grade', short: '0–5 damage', grades: [0, 1, 2, 3, 4, 5], max: 5,
      legend: { 0: 'No damage', 1: '1–10% damage', 2: '11–25% damage', 3: '26–50% damage', 4: '51–75% damage', 5: 'More than 75% damage' }
    },
    damage_1_6: {
      name: '1–6 · Damage grade (1 = healthy)', short: '1–6 damage', grades: [1, 2, 3, 4, 5, 6], min: 1, max: 6,
      legend: { 1: 'No damage (healthy)', 2: '1–10% damage', 3: '11–25% damage', 4: '26–50% damage', 5: '51–75% damage', 6: 'More than 75% damage' }
    },
    damage_0_9: {
      name: '0–9 · Damage scale', short: '0–9 damage', grades: [0, 1, 3, 5, 7, 9], max: 9,
      legend: { 0: 'No damage', 1: 'Up to 10%', 3: '11–25%', 5: '26–50%', 7: '51–75%', 9: 'More than 75%' }
    }
  };

  const num = (v) => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };

  const scoreUnits = ['Plants', 'Leaves', 'Tillers', 'Fruits'];
  const unitSingular = (u) => ({ Plants: 'plant', Leaves: 'leaf', Tillers: 'tiller', Fruits: 'fruit' }[u] || 'unit');

  // Disease Incidence, Severity Index (PDI) and Coefficient of Infection from grade-wise plant counts.
  // Handles scales whose healthy/baseline grade is not 0 (e.g. a 1–6 scale where 1 = healthy).
  const computeMetrics = (gradeCounts, scaleDef) => {
    if (!scaleDef) return null;
    const min = scaleDef.min != null ? scaleDef.min : 0;
    const span = scaleDef.max - min;
    let total = 0, infected = 0, weighted = 0;
    scaleDef.grades.forEach(g => {
      const c = num(gradeCounts && gradeCounts[g]);
      total += c; weighted += (g - min) * c;
      if (g > min) infected += c;
    });
    if (total <= 0) return { total: 0, infected: 0, incidence: 0, dsi: 0, ci: 0 };
    const incidence = (infected / total) * 100;
    const dsi = span > 0 ? (weighted / (total * span)) * 100 : 0;  // Percent Disease Index (severity)
    const ci = (incidence * dsi) / 100;                            // Coefficient of Infection = incidence × severity / 100
    return { total, infected, incidence: +incidence.toFixed(1), dsi: +dsi.toFixed(1), ci: +ci.toFixed(1) };
  };

  // Host reaction: viral diseases categorised by CI, foliar by severity index (PDI).
  const diseaseReaction = (m, scaleType) => {
    if (!m || m.total === 0) return null;
    const v = scaleType === 'viral' ? m.ci : m.dsi;
    if (v === 0) return { code: 'I', label: 'Immune', cls: 'bg-blue-100 text-blue-800' };
    if (v <= 5) return { code: 'HR', label: 'Highly Resistant', cls: 'bg-green-100 text-green-800' };
    if (v <= 10) return { code: 'R', label: 'Resistant', cls: 'bg-green-100 text-green-800' };
    if (v <= 20) return { code: 'MR', label: 'Moderately Resistant', cls: 'bg-lime-100 text-lime-800' };
    if (v <= 40) return { code: 'MS', label: 'Moderately Susceptible', cls: 'bg-yellow-100 text-yellow-800' };
    if (v <= 70) return { code: 'S', label: 'Susceptible', cls: 'bg-orange-100 text-orange-800' };
    return { code: 'HS', label: 'Highly Susceptible', cls: 'bg-red-100 text-red-800' };
  };

  const pestCategory = (m) => {
    if (!m || m.total === 0) return null;
    const v = m.dsi;
    if (v === 0) return { label: 'Nil', cls: 'bg-blue-100 text-blue-800' };
    if (v <= 10) return { label: 'Low', cls: 'bg-green-100 text-green-800' };
    if (v <= 30) return { label: 'Moderate', cls: 'bg-yellow-100 text-yellow-800' };
    if (v <= 60) return { label: 'High', cls: 'bg-orange-100 text-orange-800' };
    return { label: 'Severe', cls: 'bg-red-100 text-red-800' };
  };

  const updateDiseaseScale = (idx, scaleKey) => setFormData(prev => ({ ...prev, diseases: prev.diseases.map((d, i) => i === idx ? { ...d, ratingScale: scaleKey, gradeCounts: {} } : d) }));
  const updateDiseaseGrade = (idx, grade, val) => setFormData(prev => ({ ...prev, diseases: prev.diseases.map((d, i) => i === idx ? { ...d, gradeCounts: { ...(d.gradeCounts || {}), [grade]: val } } : d) }));
  const updatePestScale = (idx, scaleKey) => setFormData(prev => ({ ...prev, pests: prev.pests.map((p, i) => i === idx ? { ...p, ratingScale: scaleKey, gradeCounts: {} } : p) }));
  const updatePestGrade = (idx, grade, val) => setFormData(prev => ({ ...prev, pests: prev.pests.map((p, i) => i === idx ? { ...p, gradeCounts: { ...(p.gradeCounts || {}), [grade]: val } } : p) }));

  // ---------- Persistence (window.storage with graceful fallback) ----------
  useEffect(() => {
    (async () => {
      try {
        if (typeof window !== 'undefined' && window.storage) {
          const list = await window.storage.list('records:');
          const keys = (list && list.keys) || [];
          const loaded = [];
          for (const k of keys) {
            try {
              const res = await window.storage.get(k);
              if (res && res.value) loaded.push(JSON.parse(res.value));
            } catch (e) { /* skip unreadable key */ }
          }
          loaded.sort((a, b) => (b.id || 0) - (a.id || 0));
          setRecords(loaded);
        } else {
          setStorageOk(false);
        }
      } catch (e) {
        setStorageOk(false);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const persistRecord = async (rec) => {
    if (!storageOk || !window.storage) return;
    try {
      await window.storage.set(`records:${rec.id}`, JSON.stringify(rec));
    } catch (e) {
      setStorageOk(false);
    }
  };

  const unpersistRecord = async (id) => {
    if (!storageOk || !window.storage) return;
    try {
      await window.storage.delete(`records:${id}`);
    } catch (e) { /* ignore */ }
  };

  // ---------- Image helpers ----------
  const compressImage = (file) => new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const maxDim = 1000;
        let { width, height } = img;
        if (width > height && width > maxDim) { height = Math.round(height * maxDim / width); width = maxDim; }
        else if (height > maxDim) { width = Math.round(width * maxDim / height); height = maxDim; }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.6));
      };
      img.onerror = () => resolve(null);
      img.src = e.target.result;
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });

  const handleGeneralImages = async (files) => {
    const arr = Array.from(files);
    const compressed = (await Promise.all(arr.map(compressImage))).filter(Boolean);
    setFormData(prev => ({ ...prev, generalImages: [...prev.generalImages, ...compressed] }));
  };

  const removeGeneralImage = (idx) =>
    setFormData(prev => ({ ...prev, generalImages: prev.generalImages.filter((_, i) => i !== idx) }));

  const handleDiseaseImages = async (idx, files) => {
    const arr = Array.from(files);
    const compressed = (await Promise.all(arr.map(compressImage))).filter(Boolean);
    setFormData(prev => ({
      ...prev,
      diseases: prev.diseases.map((d, i) => i === idx ? { ...d, images: [...(d.images || []), ...compressed] } : d)
    }));
  };

  const removeDiseaseImage = (dIdx, imgIdx) =>
    setFormData(prev => ({
      ...prev,
      diseases: prev.diseases.map((d, i) => i === dIdx ? { ...d, images: d.images.filter((_, j) => j !== imgIdx) } : d)
    }));

  const handlePestImages = async (idx, files) => {
    const arr = Array.from(files);
    const compressed = (await Promise.all(arr.map(compressImage))).filter(Boolean);
    setFormData(prev => ({
      ...prev,
      pests: prev.pests.map((p, i) => i === idx ? { ...p, images: [...(p.images || []), ...compressed] } : p)
    }));
  };

  const removePestImage = (pIdx, imgIdx) =>
    setFormData(prev => ({
      ...prev,
      pests: prev.pests.map((p, i) => i === pIdx ? { ...p, images: p.images.filter((_, j) => j !== imgIdx) } : p)
    }));

  const getDiseases = () => {
    const merged = mergeDedupe(diseaseData[formData.variety] || [], extraDiseaseData[formData.variety] || []);
    if (merged.length) return merged;
    return [
      { common: 'Leaf Spot', scientific: 'Cercospora spp.' },
      { common: 'Powdery Mildew', scientific: 'Erysiphe spp.' },
      { common: 'Root Rot', scientific: 'Pythium spp.' },
      { common: 'Wilt', scientific: 'Fusarium spp.' },
      { common: 'Blight', scientific: 'Various pathogens' }
    ];
  };

  const getPests = () => {
    const merged = mergeDedupe(pestData[formData.variety] || [], extraPestData[formData.variety] || []);
    if (merged.length) return merged;
    return [
      { common: 'Aphids', scientific: 'Aphididae' },
      { common: 'Whitefly', scientific: 'Aleyrodidae' },
      { common: 'Thrips', scientific: 'Thysanoptera' },
      { common: 'Mites', scientific: 'Tetranychidae' },
      { common: 'Caterpillars', scientific: 'Lepidoptera larvae' }
    ];
  };

  // Crop-specific growth & yield parameters (name + unit). Falls back by crop type, then generic.
  const growthYieldData = {
    Coconut: {
      growth: [['Palm height', 'm'], ['Number of leaves (fronds)', 'no.'], ['Collar girth', 'cm'], ['Number of leaflets', 'no.'], ['Petiole length', 'cm'], ['Number of female flowers', 'no.'], ['Number of leaf scars', 'no.']],
      yield: [['Number of bunches (spadices)', 'no.'], ['Number of nuts per palm/year', 'no.'], ['Nut weight', 'g'], ['Copra content', 'g/nut'], ['Oil content', '%'], ['Number of buttons set', 'no.'], ['Tender nut water', 'ml']]
    },
    Cashew: {
      growth: [['Plant height', 'm'], ['Canopy spread (E–W)', 'm'], ['Canopy spread (N–S)', 'm'], ['Stem girth', 'cm'], ['Number of flowering laterals', 'no.'], ['Sex ratio (bisexual:male)', 'ratio']],
      yield: [['Number of nuts per panicle', 'no.'], ['Nut weight', 'g'], ['Apple weight', 'g'], ['Yield per tree', 'kg'], ['Shelling percentage', '%'], ['Kernel weight', 'g'], ['Nut yield', 't/ha']]
    },
    Tomato: {
      growth: [['Plant height', 'cm'], ['Number of primary branches', 'no.'], ['Days to 50% flowering', 'days'], ['Number of flowers per cluster', 'no.'], ['Number of clusters per plant', 'no.']],
      yield: [['Number of fruits per plant', 'no.'], ['Average fruit weight', 'g'], ['Fruit length', 'cm'], ['Fruit diameter', 'cm'], ['Number of locules', 'no.'], ['TSS', '°Brix'], ['Yield per plant', 'kg'], ['Yield', 't/ha']]
    },
    Potato: {
      growth: [['Plant height', 'cm'], ['Number of stems per plant', 'no.'], ['Number of compound leaves', 'no.'], ['Days to maturity', 'days']],
      yield: [['Number of tubers per plant', 'no.'], ['Average tuber weight', 'g'], ['Tuber yield per plant', 'g'], ['Specific gravity', '—'], ['Dry matter', '%'], ['Yield', 't/ha']]
    },
    Mango: {
      growth: [['Plant height', 'm'], ['Canopy spread', 'm'], ['Trunk girth', 'cm'], ['Number of panicles', 'no.'], ['Panicle length', 'cm']],
      yield: [['Number of fruits per tree', 'no.'], ['Average fruit weight', 'g'], ['Fruit length', 'cm'], ['Pulp percentage', '%'], ['Stone weight', 'g'], ['TSS', '°Brix'], ['Yield per tree', 'kg']]
    },
    Banana: {
      growth: [['Pseudostem height', 'cm'], ['Pseudostem girth', 'cm'], ['Number of functional leaves', 'no.'], ['Days to shooting', 'days'], ['Days to harvest', 'days']],
      yield: [['Number of hands per bunch', 'no.'], ['Number of fingers per bunch', 'no.'], ['Bunch weight', 'kg'], ['Finger weight', 'g'], ['Finger length', 'cm'], ['Finger girth', 'cm'], ['Yield', 't/ha']]
    },
    Rose: {
      growth: [['Plant height', 'cm'], ['Number of branches', 'no.'], ['Number of shoots', 'no.'], ['Stem length', 'cm']],
      yield: [['Number of flowers per plant', 'no.'], ['Flower diameter', 'cm'], ['Flower weight', 'g'], ['Number of petals', 'no.'], ['Stalk length', 'cm'], ['Vase life', 'days']]
    },
    Chili: {
      growth: [['Plant height', 'cm'], ['Number of branches', 'no.'], ['Days to 50% flowering', 'days'], ['Canopy spread', 'cm']],
      yield: [['Number of fruits per plant', 'no.'], ['Average fruit weight', 'g'], ['Fruit length', 'cm'], ['Fruit girth', 'cm'], ['Green chilli yield per plant', 'g'], ['Dry chilli yield', 'g'], ['Capsaicin', '%'], ['Yield', 't/ha']]
    },
    Brinjal: {
      growth: [['Plant height', 'cm'], ['Number of branches', 'no.'], ['Days to 50% flowering', 'days'], ['Number of flowers per cluster', 'no.']],
      yield: [['Number of fruits per plant', 'no.'], ['Average fruit weight', 'g'], ['Fruit length', 'cm'], ['Fruit girth', 'cm'], ['Yield per plant', 'kg'], ['Yield', 't/ha']]
    },
    Okra: {
      growth: [['Plant height', 'cm'], ['Number of branches', 'no.'], ['Days to 50% flowering', 'days'], ['Internodal length', 'cm'], ['Node of first fruiting', 'no.']],
      yield: [['Number of fruits per plant', 'no.'], ['Fruit length', 'cm'], ['Fruit weight', 'g'], ['Yield per plant', 'g'], ['Yield', 't/ha']]
    },
    Onion: {
      growth: [['Plant height', 'cm'], ['Number of leaves', 'no.'], ['Neck thickness', 'cm']],
      yield: [['Bulb weight', 'g'], ['Polar diameter', 'cm'], ['Equatorial diameter', 'cm'], ['TSS', '°Brix'], ['Yield', 't/ha']]
    },
    Cabbage: {
      growth: [['Plant height', 'cm'], ['Number of non-wrapper leaves', 'no.'], ['Plant spread', 'cm']],
      yield: [['Head weight', 'kg'], ['Head diameter', 'cm'], ['Head compactness index', '—'], ['Yield', 't/ha']]
    },
    Cauliflower: {
      growth: [['Plant height', 'cm'], ['Number of leaves', 'no.'], ['Plant spread', 'cm']],
      yield: [['Curd weight', 'g'], ['Curd diameter', 'cm'], ['Days to curd maturity', 'days'], ['Yield', 't/ha']]
    },
    Beans: {
      growth: [['Plant height', 'cm'], ['Number of branches', 'no.'], ['Days to 50% flowering', 'days']],
      yield: [['Number of pods per plant', 'no.'], ['Pod length', 'cm'], ['Pod weight', 'g'], ['Number of seeds per pod', 'no.'], ['Yield per plant', 'g'], ['Yield', 't/ha']]
    },
    Apple: {
      growth: [['Tree height', 'm'], ['Trunk girth', 'cm'], ['Canopy spread', 'm']],
      yield: [['Number of fruits per tree', 'no.'], ['Average fruit weight', 'g'], ['Fruit diameter', 'cm'], ['TSS', '°Brix'], ['Yield per tree', 'kg']]
    },
    Orange: {
      growth: [['Tree height', 'm'], ['Canopy spread', 'm'], ['Trunk girth', 'cm']],
      yield: [['Number of fruits per tree', 'no.'], ['Average fruit weight', 'g'], ['Juice content', '%'], ['TSS', '°Brix'], ['Yield per tree', 'kg']]
    },
    Grapes: {
      growth: [['Cane length', 'cm'], ['Number of canes', 'no.'], ['Internodal length', 'cm']],
      yield: [['Number of bunches per vine', 'no.'], ['Bunch weight', 'g'], ['Berry weight', 'g'], ['TSS', '°Brix'], ['Yield per vine', 'kg'], ['Yield', 't/ha']]
    },
    Guava: {
      growth: [['Plant height', 'm'], ['Canopy spread', 'm'], ['Stem girth', 'cm']],
      yield: [['Number of fruits per tree', 'no.'], ['Average fruit weight', 'g'], ['Fruit diameter', 'cm'], ['TSS', '°Brix'], ['Yield per tree', 'kg']]
    },
    Pomegranate: {
      growth: [['Plant height', 'm'], ['Canopy spread', 'm'], ['Number of branches', 'no.']],
      yield: [['Number of fruits per plant', 'no.'], ['Average fruit weight', 'g'], ['Fruit diameter', 'cm'], ['Aril weight per fruit', 'g'], ['TSS', '°Brix'], ['Yield per plant', 'kg']]
    },
    Turmeric: {
      growth: [['Plant height', 'cm'], ['Number of tillers', 'no.'], ['Number of leaves', 'no.'], ['Leaf length', 'cm']],
      yield: [['Number of mother rhizomes', 'no.'], ['Number of fingers', 'no.'], ['Rhizome weight per plant', 'g'], ['Fresh rhizome yield', 't/ha'], ['Dry recovery', '%'], ['Curcumin', '%']]
    },
    Ginger: {
      growth: [['Plant height', 'cm'], ['Number of tillers', 'no.'], ['Number of leaves', 'no.']],
      yield: [['Rhizome weight per plant', 'g'], ['Number of fingers', 'no.'], ['Fresh yield', 't/ha'], ['Dry recovery', '%'], ['Oleoresin', '%']]
    },
    Cardamom: {
      growth: [['Plant height', 'm'], ['Number of tillers', 'no.'], ['Number of panicles', 'no.']],
      yield: [['Number of capsules per panicle', 'no.'], ['Capsule weight', 'g'], ['Dry yield per plant', 'g'], ['Yield', 'kg/ha']]
    },
    Pepper: {
      growth: [['Vine length', 'm'], ['Number of laterals', 'no.'], ['Internodal length', 'cm']],
      yield: [['Number of spikes per vine', 'no.'], ['Spike length', 'cm'], ['Number of berries per spike', 'no.'], ['Green yield per vine', 'kg'], ['Dry recovery', '%']]
    },
    Coriander: {
      growth: [['Plant height', 'cm'], ['Number of branches', 'no.'], ['Number of umbels per plant', 'no.']],
      yield: [['Number of seeds per umbel', 'no.'], ['1000-seed weight', 'g'], ['Seed yield per plant', 'g'], ['Yield', 'kg/ha'], ['Essential oil', '%']]
    },
    Marigold: {
      growth: [['Plant height', 'cm'], ['Number of branches', 'no.'], ['Plant spread', 'cm']],
      yield: [['Number of flowers per plant', 'no.'], ['Flower diameter', 'cm'], ['Flower weight', 'g'], ['Flower yield per plant', 'g'], ['Yield', 't/ha']]
    },
    Jasmine: {
      growth: [['Plant height', 'cm'], ['Number of branches', 'no.'], ['Number of shoots', 'no.']],
      yield: [['Number of flowers per plant', 'no.'], ['Flower bud length', 'cm'], ['100-flower weight', 'g'], ['Flower yield per plant', 'g'], ['Yield', 't/ha']]
    },
    Chrysanthemum: {
      growth: [['Plant height', 'cm'], ['Number of branches', 'no.'], ['Plant spread', 'cm']],
      yield: [['Number of flowers per plant', 'no.'], ['Flower diameter', 'cm'], ['Flower weight', 'g'], ['Flower yield per plant', 'g'], ['Yield', 't/ha']]
    },
    Orchid: {
      growth: [['Plant height', 'cm'], ['Number of leaves', 'no.'], ['Number of pseudobulbs', 'no.']],
      yield: [['Number of spikes per plant', 'no.'], ['Spike length', 'cm'], ['Number of florets per spike', 'no.'], ['Floret diameter', 'cm'], ['Vase life', 'days']]
    },
    Carnation: {
      growth: [['Plant height', 'cm'], ['Number of branches', 'no.'], ['Stem length', 'cm']],
      yield: [['Number of flowers per plant', 'no.'], ['Flower diameter', 'cm'], ['Stalk length', 'cm'], ['Vase life', 'days'], ['Yield', 'no./m²']]
    },
    'Areca Nut': {
      growth: [['Palm height', 'm'], ['Stem girth', 'cm'], ['Number of leaves', 'no.']],
      yield: [['Number of bunches', 'no.'], ['Number of nuts per palm', 'no.'], ['Nut weight', 'g'], ['Chali recovery', '%']]
    },
    Coffee: {
      growth: [['Plant height', 'm'], ['Number of primaries', 'no.'], ['Stem girth', 'cm'], ['Canopy spread', 'm']],
      yield: [['Number of berries per node', 'no.'], ['Berry weight', 'g'], ['Yield per plant', 'kg'], ['Clean coffee out-turn', '%'], ['Yield', 'kg/ha']]
    },
    Tea: {
      growth: [['Bush height', 'cm'], ['Frame spread', 'cm'], ['Number of shoots', 'no.']],
      yield: [['Number of harvestable shoots', 'no.'], ['Shoot weight', 'g'], ['Green leaf yield', 'kg/ha'], ['Made tea yield', 'kg/ha']]
    },
    Rubber: {
      growth: [['Plant height', 'm'], ['Girth at 125 cm', 'cm'], ['Bark thickness', 'mm'], ['Number of latex vessel rows', 'no.']],
      yield: [['Dry rubber yield per tap', 'g'], ['Dry rubber content', '%'], ['Yield', 'kg/ha']]
    },
    'Aloe Vera': {
      growth: [['Plant height', 'cm'], ['Number of leaves', 'no.'], ['Leaf length', 'cm'], ['Leaf width', 'cm']],
      yield: [['Leaf weight', 'g'], ['Number of suckers', 'no.'], ['Gel content', '%'], ['Leaf yield', 't/ha']]
    },
    Tulsi: {
      growth: [['Plant height', 'cm'], ['Number of branches', 'no.'], ['Number of leaves', 'no.']],
      yield: [['Fresh herb yield per plant', 'g'], ['Dry herb yield', 'kg/ha'], ['Essential oil', '%'], ['Seed yield', 'kg/ha']]
    },
    Ashwagandha: {
      growth: [['Plant height', 'cm'], ['Number of branches', 'no.'], ['Root length', 'cm']],
      yield: [['Root diameter', 'cm'], ['Fresh root weight per plant', 'g'], ['Dry root yield', 'kg/ha'], ['Withanolide', '%']]
    },
    Brahmi: {
      growth: [['Trailing length', 'cm'], ['Number of branches', 'no.'], ['Number of leaves', 'no.']],
      yield: [['Number of nodes', 'no.'], ['Fresh herb yield per plant', 'g'], ['Dry herb yield', 't/ha'], ['Bacoside', '%']]
    },
    Neem: {
      growth: [['Plant height', 'm'], ['Stem girth', 'cm'], ['Canopy spread', 'm']],
      yield: [['Number of fruits per tree', 'no.'], ['Fruit weight', 'g'], ['Kernel weight', 'g'], ['Azadirachtin', '%'], ['Oil content', '%']]
    },
    Papaya: {
      growth: [['Plant height', 'm'], ['Stem girth', 'cm'], ['Number of functional leaves', 'no.'], ['Days to flowering', 'days'], ['Height to first fruit', 'cm']],
      yield: [['Number of fruits per plant', 'no.'], ['Average fruit weight', 'g'], ['Fruit length', 'cm'], ['Flesh thickness', 'cm'], ['TSS', '°Brix'], ['Yield per plant', 'kg'], ['Yield', 't/ha']]
    }
  };

  const cropTypeGenerics = {
    Vegetables: { growth: [['Plant height', 'cm'], ['Number of branches', 'no.'], ['Days to 50% flowering', 'days']], yield: [['Number of fruits per plant', 'no.'], ['Average fruit weight', 'g'], ['Yield per plant', 'kg'], ['Yield', 't/ha']] },
    Fruits: { growth: [['Plant height', 'm'], ['Canopy spread', 'm'], ['Trunk girth', 'cm']], yield: [['Number of fruits per tree', 'no.'], ['Average fruit weight', 'g'], ['TSS', '°Brix'], ['Yield per tree', 'kg']] },
    Flowers: { growth: [['Plant height', 'cm'], ['Number of branches', 'no.'], ['Stem length', 'cm']], yield: [['Number of flowers per plant', 'no.'], ['Flower diameter', 'cm'], ['Flower weight', 'g'], ['Vase life', 'days']] },
    Spices: { growth: [['Plant height', 'cm'], ['Number of tillers', 'no.'], ['Number of leaves', 'no.']], yield: [['Fresh yield per plant', 'g'], ['Dry yield per plant', 'g'], ['Yield', 't/ha']] },
    'Medicinal Plants': { growth: [['Plant height', 'cm'], ['Number of branches', 'no.'], ['Number of leaves', 'no.']], yield: [['Fresh biomass per plant', 'g'], ['Dry biomass per plant', 'g'], ['Yield', 't/ha']] },
    'Plantation Crops': { growth: [['Plant height', 'm'], ['Stem/collar girth', 'cm'], ['Number of leaves', 'no.']], yield: [['Yield per tree/palm', 'kg'], ['Yield', 't/ha']] }
  };

  const genericGrowth = [['Plant height', 'cm'], ['Number of leaves', 'no.'], ['Number of branches', 'no.'], ['Stem girth', 'cm'], ['Days to flowering', 'days'], ['Days to maturity', 'days']];
  const genericYield = [['Number of fruits per plant', 'no.'], ['Average fruit weight', 'g'], ['Yield per plant', 'kg'], ['Yield', 't/ha']];

  const toParam = (arr) => arr.map(([name, unit]) => ({ name, unit }));
  const getGrowthParams = () => {
    if (growthYieldData[formData.variety]) return toParam(growthYieldData[formData.variety].growth);
    if (cropTypeGenerics[formData.cropType]) return toParam(cropTypeGenerics[formData.cropType].growth);
    return toParam(genericGrowth);
  };
  const getYieldParams = () => {
    if (growthYieldData[formData.variety]) return toParam(growthYieldData[formData.variety].yield);
    if (cropTypeGenerics[formData.cropType]) return toParam(cropTypeGenerics[formData.cropType].yield);
    return toParam(genericYield);
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value,
      ...(name === 'cropType' && { variety: '' }),
      ...(name === 'category' && { subCategory: '' })
    }));
  };

  const getGPS = () => {
    if (!navigator.geolocation) { setGpsStatus('error'); return; }
    setGpsStatus('loading');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setFormData(prev => ({ ...prev, gpsCoordinates: `${pos.coords.latitude.toFixed(6)}, ${pos.coords.longitude.toFixed(6)}` }));
        setGpsStatus('idle');
      },
      () => setGpsStatus('error'),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const addDisease = () => setFormData(prev => ({ ...prev, diseases: [...prev.diseases, {
    name: '', scientificName: '', severity: 'moderate', ratingScale: '', scoreUnit: 'Plants', gradeCounts: {}, images: []
  }] }));
  const updateDisease = (idx, field, val) => setFormData(prev => ({ ...prev, diseases: prev.diseases.map((d, i) => i === idx ? { ...d, [field]: val } : d) }));
  const removeDisease = (idx) => setFormData(prev => ({ ...prev, diseases: prev.diseases.filter((_, i) => i !== idx) }));

  const openScan = (idx) => { setScanForIdx(idx); scanInput.current?.click(); };
  const onScanFile = (file) => {
    const reader = new FileReader();
    reader.onload = (e) => setScanState({ idx: scanForIdx, src: e.target.result });
    reader.readAsDataURL(file);
  };
  const applyScan = (pct, grade) => {
    const idx = scanState.idx;
    setFormData(prev => ({
      ...prev,
      diseases: prev.diseases.map((d, i) => {
        if (i !== idx) return d;
        const next = { ...d, measuredSeverity: pct };
        if (grade != null) {
          const gc = { ...(d.gradeCounts || {}) };
          gc[grade] = String((parseInt(gc[grade] || '0', 10) || 0) + 1);
          next.gradeCounts = gc;
        }
        return next;
      })
    }));
    setScanState(null);
  };

  const addPest = () => setFormData(prev => ({ ...prev, pests: [...prev.pests, {
    name: '', scientificName: '', infestation: 'moderate', ratingScale: '', scoreUnit: 'Plants', gradeCounts: {}, population: '', images: []
  }] }));
  const updatePest = (idx, field, val) => setFormData(prev => ({ ...prev, pests: prev.pests.map((p, i) => i === idx ? { ...p, [field]: val } : p) }));
  const removePest = (idx) => setFormData(prev => ({ ...prev, pests: prev.pests.filter((_, i) => i !== idx) }));

  const addGrowthParam = (param) => setFormData(prev => ({ ...prev, growthParams: [...prev.growthParams, { name: param ? param.name : '', unit: param ? param.unit : '', value: '' }] }));
  const updateGrowthParam = (idx, field, val) => setFormData(prev => ({ ...prev, growthParams: prev.growthParams.map((g, i) => i === idx ? { ...g, [field]: val } : g) }));
  const removeGrowthParam = (idx) => setFormData(prev => ({ ...prev, growthParams: prev.growthParams.filter((_, i) => i !== idx) }));

  const addYieldParam = (param) => setFormData(prev => ({ ...prev, yieldParams: [...prev.yieldParams, { name: param ? param.name : '', unit: param ? param.unit : '', value: '' }] }));
  const updateYieldParam = (idx, field, val) => setFormData(prev => ({ ...prev, yieldParams: prev.yieldParams.map((y, i) => i === idx ? { ...y, [field]: val } : y) }));
  const removeYieldParam = (idx) => setFormData(prev => ({ ...prev, yieldParams: prev.yieldParams.filter((_, i) => i !== idx) }));

  const addCustomDisease = (idx) => {
    if (!newDiseaseCommon.trim()) { alert('Please enter disease name'); return; }
    updateDisease(idx, 'name', newDiseaseCommon.trim());
    updateDisease(idx, 'scientificName', newDiseaseScientific.trim() || 'Not specified');
    setNewDiseaseCommon(''); setNewDiseaseScientific(''); setShowAddDisease(null);
  };

  const addCustomPest = (idx) => {
    if (!newPestCommon.trim()) { alert('Please enter pest name'); return; }
    updatePest(idx, 'name', newPestCommon.trim());
    updatePest(idx, 'scientificName', newPestScientific.trim() || 'Not specified');
    setNewPestCommon(''); setNewPestScientific(''); setShowAddPest(null);
  };

  const handleSubmit = async () => {
    if (!formData.category || !formData.farmerId || !formData.farmerName || !formData.location || !formData.cropType || !formData.variety) {
      alert('Please fill all required (*) fields'); return;
    }
    if (editingId) {
      const existing = records.find(r => r.id === editingId);
      const updated = { ...existing, ...formData, id: editingId, updatedAt: new Date().toISOString() };
      setRecords(prev => prev.map(r => r.id === editingId ? updated : r));
      await persistRecord(updated);
      setEditingId(null);
    } else {
      const newRec = {
        ...formData,
        id: Date.now(),
        timestamp: new Date().toISOString(),
        recordNumber: `HC${String(records.length + 1).padStart(4, '0')}`
      };
      setRecords(prev => [newRec, ...prev]);
      await persistRecord(newRec);
    }
    setFormData(emptyForm);
    setShowForm(false);
    setGpsStatus('idle');
  };

  const startEdit = (rec) => {
    setFormData({
      category: rec.category || '', subCategory: rec.subCategory || '', farmerId: rec.farmerId || '', farmerName: rec.farmerName || '',
      location: rec.location || '', gpsCoordinates: rec.gpsCoordinates || '', siteName: rec.siteName || '',
      cropType: rec.cropType || '', variety: rec.variety || '', plantingDate: rec.plantingDate || '', plantHealth: rec.plantHealth || 'good',
      diseases: rec.diseases || [], pests: rec.pests || [], growthParams: rec.growthParams || [], yieldParams: rec.yieldParams || [], notes: rec.notes || '', generalImages: rec.generalImages || []
    });
    setEditingId(rec.id);
    setView('records');
    setShowForm(true);
    setExpandedRecord(null);
    if (typeof window !== 'undefined' && window.scrollTo) window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const toggleForm = () => {
    if (showForm) { setShowForm(false); setEditingId(null); setFormData(emptyForm); }
    else { setEditingId(null); setFormData(emptyForm); setView('records'); setShowForm(true); }
  };

  const importJSON = async (file) => {
    try {
      const data = JSON.parse(await file.text());
      if (!Array.isArray(data)) { alert('That file does not look like a HortiScan export.'); return; }
      let merged = [...records];
      let count = 0;
      for (const raw of data) {
        if (!raw || typeof raw !== 'object') continue;
        const rec = { ...raw };
        if (!rec.id) rec.id = Date.now() + Math.floor(Math.random() * 100000);
        if (!rec.timestamp) rec.timestamp = new Date().toISOString();
        if (!rec.recordNumber) rec.recordNumber = `HC${String(merged.length + 1).padStart(4, '0')}`;
        rec.diseases = rec.diseases || []; rec.pests = rec.pests || []; rec.generalImages = rec.generalImages || [];
        rec.growthParams = rec.growthParams || []; rec.yieldParams = rec.yieldParams || [];
        const idx = merged.findIndex(x => x.id === rec.id);
        if (idx >= 0) merged[idx] = rec; else merged.unshift(rec);
        await persistRecord(rec);
        count++;
      }
      merged.sort((a, b) => (b.id || 0) - (a.id || 0));
      setRecords(merged);
      alert(`Imported ${count} record(s).`);
    } catch (e) {
      alert('Could not read that file. Make sure it is a HortiScan JSON export.');
    }
  };

  const deleteRecord = async (id) => {
    setRecords(prev => prev.filter(r => r.id !== id));
    if (expandedRecord === id) setExpandedRecord(null);
    await unpersistRecord(id);
  };

  const exportJSON = () => {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([JSON.stringify(records, null, 2)], { type: 'application/json' }));
    link.download = `hortiscan_${new Date().toISOString().split('T')[0]}.json`;
    link.click();
  };

  const csvCell = (v) => {
    const s = (v === undefined || v === null) ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const exportCSV = () => {
    const headers = [
      'Record No', 'Date', 'Category', 'Sub-Category', 'Farmer ID', 'Farmer Name',
      'Location', 'Site Name', 'GPS', 'Crop Type', 'Variety', 'Planting Date', 'Plant Health',
      'Diseases', 'Pests', 'Growth Parameters', 'Yield Parameters', 'Photo Count', 'Notes'
    ];
    const rows = records.map(r => {
      const fmtDisease = (d) => {
        const meas = d.measuredSeverity != null ? `, scanArea=${d.measuredSeverity}%` : '';
        const sd = d.ratingScale ? diseaseScales[d.ratingScale] : null;
        if (sd) {
          const m = computeMetrics(d.gradeCounts, sd);
          const rx = diseaseReaction(m, sd.type);
          return `${d.name} [${d.scientificName}] {${sd.short}: n=${m.total} ${(d.scoreUnit || 'plants').toLowerCase()}, incidence=${m.incidence}%, severityIndex=${m.dsi}%${sd.type === 'viral' ? `, CI=${m.ci}` : ''}${rx ? `, reaction=${rx.code} (${rx.label})` : ''}${meas}}`;
        }
        return `${d.name} [${d.scientificName}] (severity: ${d.severity}${d.scale ? `, scale ${d.scale}/5` : ''}${meas})`;
      };
      const fmtPest = (p) => {
        const sd = p.ratingScale ? pestScales[p.ratingScale] : null;
        if (sd) {
          const m = computeMetrics(p.gradeCounts, sd);
          const cat = pestCategory(m);
          return `${p.name} [${p.scientificName}] {${sd.short}: n=${m.total} ${(p.scoreUnit || 'plants').toLowerCase()}, infestation=${m.incidence}%, damageIndex=${m.dsi}%${p.population ? `, pop=${p.population}` : ''}${cat ? `, level=${cat.label}` : ''}}`;
        }
        return `${p.name} [${p.scientificName}] (infestation: ${p.infestation}${p.scale ? `, scale ${p.scale}/5` : ''})`;
      };
      const diseases = (r.diseases || []).map(fmtDisease).join('; ');
      const pests = (r.pests || []).map(fmtPest).join('; ');
      const growth = (r.growthParams || []).filter(g => g.name && g.value !== '').map(g => `${g.name}=${g.value} ${g.unit}`).join('; ');
      const yields = (r.yieldParams || []).filter(y => y.name && y.value !== '').map(y => `${y.name}=${y.value} ${y.unit}`).join('; ');
      const photoCount = (r.generalImages || []).length
        + (r.diseases || []).reduce((s, d) => s + (d.images ? d.images.length : 0), 0)
        + (r.pests || []).reduce((s, p) => s + (p.images ? p.images.length : 0), 0);
      return [
        r.recordNumber, (r.timestamp || '').split('T')[0], r.category, r.subCategory, r.farmerId, r.farmerName,
        r.location, r.siteName, r.gpsCoordinates, r.cropType, r.variety, r.plantingDate, r.plantHealth,
        diseases, pests, growth, yields, photoCount, r.notes
      ].map(csvCell).join(',');
    });
    const csv = [headers.join(','), ...rows].join('\n');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' }));
    link.download = `hortiscan_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  const healthColor = {
    excellent: 'bg-green-100 text-green-800',
    good: 'bg-emerald-100 text-emerald-800',
    fair: 'bg-yellow-100 text-yellow-800',
    poor: 'bg-red-100 text-red-800'
  };

  const rxHex = { I: '#3b82f6', HR: '#16a34a', R: '#22c55e', MR: '#84cc16', MS: '#eab308', S: '#f97316', HS: '#dc2626' };

  const cropList = useMemo(() => [...new Set(records.map(r => r.variety).filter(Boolean))].sort(), [records]);

  const visibleRecords = useMemo(() => {
    let list = [...records];
    const q = searchText.trim().toLowerCase();
    if (q) list = list.filter(r => {
      const hay = [r.recordNumber, r.farmerName, r.farmerId, r.location, r.siteName, r.variety, r.cropType, r.category, r.notes,
        ...(r.diseases || []).map(d => d.name), ...(r.pests || []).map(p => p.name)].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    });
    if (filterCategory) list = list.filter(r => r.category === filterCategory);
    if (filterCrop) list = list.filter(r => r.variety === filterCrop);
    list.sort((a, b) => {
      if (sortBy === 'oldest') return (a.id || 0) - (b.id || 0);
      if (sortBy === 'farmer') return (a.farmerName || '').localeCompare(b.farmerName || '');
      if (sortBy === 'variety') return (a.variety || '').localeCompare(b.variety || '');
      return (b.id || 0) - (a.id || 0);
    });
    return list;
  }, [records, searchText, filterCategory, filterCrop, sortBy]);

  const summary = useMemo(() => {
    const byVariety = {};
    const diseaseFreq = {}, pestFreq = {};
    const gy = {};
    records.forEach(r => {
      const v = r.variety || '—';
      if (!byVariety[v]) byVariety[v] = { recs: new Set(), obs: 0, sumInc: 0, sumDsi: 0, sumCi: 0, ciCount: 0 };
      byVariety[v].recs.add(r.id);
      (r.diseases || []).forEach(d => {
        if (d.name) diseaseFreq[d.name] = (diseaseFreq[d.name] || 0) + 1;
        const sd = d.ratingScale ? diseaseScales[d.ratingScale] : null;
        if (sd) {
          const m = computeMetrics(d.gradeCounts, sd);
          if (m && m.total > 0) {
            const bv = byVariety[v];
            bv.obs += 1; bv.sumInc += m.incidence; bv.sumDsi += m.dsi;
            if (sd.type === 'viral') { bv.sumCi += m.ci; bv.ciCount += 1; }
          }
        }
      });
      (r.pests || []).forEach(p => { if (p.name) pestFreq[p.name] = (pestFreq[p.name] || 0) + 1; });
      const crop = r.variety || '—';
      [['growth', r.growthParams], ['yield', r.yieldParams]].forEach(([kind, arr]) => {
        (arr || []).forEach(pm => {
          const val = parseFloat(pm.value);
          if (!pm.name || isNaN(val)) return;
          gy[crop] = gy[crop] || {};
          const key = kind + '::' + pm.name;
          if (!gy[crop][key]) gy[crop][key] = { kind, name: pm.name, unit: pm.unit || '', sum: 0, n: 0 };
          gy[crop][key].sum += val; gy[crop][key].n += 1;
        });
      });
    });
    const varieties = Object.entries(byVariety).map(([variety, s]) => {
      const meanInc = s.obs ? +(s.sumInc / s.obs).toFixed(1) : 0;
      const meanDsi = s.obs ? +(s.sumDsi / s.obs).toFixed(1) : 0;
      const meanCi = s.ciCount ? +(s.sumCi / s.ciCount).toFixed(1) : null;
      const rx = s.obs ? diseaseReaction({ total: 1, dsi: meanDsi }, 'general') : null;
      return { variety, records: s.recs.size, obs: s.obs, meanInc, meanDsi, meanCi, rx };
    });
    varieties.sort((a, b) => {
      if (a.obs === 0 && b.obs === 0) return b.records - a.records;
      if (a.obs === 0) return 1;
      if (b.obs === 0) return -1;
      return a.meanDsi - b.meanDsi;
    });
    const topDiseases = Object.entries(diseaseFreq).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const topPests = Object.entries(pestFreq).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const paramMeans = [];
    Object.entries(gy).forEach(([crop, params]) => {
      Object.values(params).forEach(p => paramMeans.push({ crop, kind: p.kind, name: p.name, unit: p.unit, mean: +(p.sum / p.n).toFixed(2), n: p.n }));
    });
    paramMeans.sort((a, b) => a.crop.localeCompare(b.crop) || a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name));
    return { varieties, topDiseases, topPests, paramMeans };
  }, [records]);

  const chartData = useMemo(() => summary.varieties.filter(v => v.obs > 0).slice(0, 12)
    .map(v => ({ name: v.variety, pdi: v.meanDsi, color: rxHex[v.rx && v.rx.code] || '#16a34a' })), [summary]);

  const Thumb = ({ src, onRemove }) => (
    <div className="relative">
      <img src={src} alt="" className="w-16 h-16 object-cover rounded border border-gray-300" />
      {onRemove && (
        <button type="button" onClick={onRemove} className="absolute -top-1.5 -right-1.5 bg-red-600 text-white rounded-full p-0.5 shadow">
          <X size={12} />
        </button>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100">
      <div className="max-w-4xl mx-auto p-4 pb-20">
        <div className="bg-gradient-to-r from-green-600 to-emerald-600 rounded-xl shadow-lg p-6 mb-6 text-white">
          <div className="flex justify-between items-start">
            <h1 className="text-3xl font-bold mb-2">🌱 HortiScan</h1>
            <button onClick={() => setAboutOpen(true)} className="text-green-100 hover:text-white p-1 -mt-1" title="About / Licence"><Info size={22} /></button>
          </div>
          <p className="text-green-100 mb-3">Research • Extension • Precision Horticulture</p>
          <div className="text-xs text-green-200 border-t border-green-400 pt-3 mt-2">
            <p className="font-semibold">Developed by: Dr. T. Rajasekharam</p>
            <p>Senior Scientist (Plant Pathology)</p>
            <p>Dr. YSR Horticultural University</p>
          </div>
        </div>

        {!storageOk && !loading && (
          <div className="bg-amber-50 border border-amber-300 text-amber-900 text-sm rounded-lg p-3 mb-4">
            Records are kept for this session only — saved data won't persist after the page closes in this environment.
          </div>
        )}

        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-sm text-gray-600 mb-1">Total Records</div>
            <div className="text-3xl font-bold text-green-600">{records.length}</div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-sm text-gray-600 mb-1">Issues Tracked</div>
            <div className="text-3xl font-bold text-emerald-600">{records.reduce((sum, r) => sum + r.diseases.length + r.pests.length, 0)}</div>
          </div>
        </div>

        <div className="flex flex-wrap gap-3 mb-4">
          <button onClick={toggleForm} className="flex-1 min-w-[140px] bg-green-600 hover:bg-green-700 text-white font-semibold py-3 px-4 rounded-lg shadow-lg flex items-center justify-center gap-2">
            <Plus size={20} />{showForm ? 'Cancel' : 'New Record'}
          </button>
          <button onClick={() => jsonInput.current?.click()} className="bg-emerald-700 hover:bg-emerald-800 text-white font-semibold py-3 px-4 rounded-lg shadow-lg flex items-center gap-2"><Upload size={20} />Import</button>
          <input ref={jsonInput} type="file" accept="application/json,.json" className="hidden" onChange={(e) => { if (e.target.files[0]) importJSON(e.target.files[0]); e.target.value = ''; }} />
          <input ref={scanInput} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { if (e.target.files[0]) onScanFile(e.target.files[0]); e.target.value = ''; }} />
          {records.length > 0 && (
            <>
              <button onClick={exportCSV} className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-lg shadow-lg flex items-center gap-2"><FileText size={20} />CSV</button>
              <button onClick={exportJSON} className="bg-slate-600 hover:bg-slate-700 text-white font-semibold py-3 px-4 rounded-lg shadow-lg flex items-center gap-2"><Download size={20} />JSON</button>
            </>
          )}
        </div>

        <div className="flex gap-2 mb-6 bg-white rounded-lg shadow p-1">
          <button onClick={() => setView('records')} className={`flex-1 py-2 rounded-md text-sm font-semibold flex items-center justify-center gap-2 ${view === 'records' ? 'bg-green-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}><Eye size={16} />Records</button>
          <button onClick={() => setView('summary')} className={`flex-1 py-2 rounded-md text-sm font-semibold flex items-center justify-center gap-2 ${view === 'summary' ? 'bg-green-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}><BarChart3 size={16} />Summary</button>
        </div>

        {showForm && (
          <div className="bg-white rounded-xl shadow-xl p-6 mb-6">
            <h2 className="text-2xl font-bold text-gray-800 mb-6">{editingId ? 'Edit Record' : 'New Record'}</h2>

            <div className="space-y-4">
              <div className="grid md:grid-cols-2 gap-3">
                <input type="text" name="farmerId" value={formData.farmerId} onChange={handleInputChange} placeholder="Farmer ID *" className="px-3 py-2 border rounded" />
                <input type="text" name="farmerName" value={formData.farmerName} onChange={handleInputChange} placeholder="Farmer Name *" className="px-3 py-2 border rounded" />
                <input type="text" name="location" value={formData.location} onChange={handleInputChange} placeholder="Location (village / mandal / district) *" className="md:col-span-2 px-3 py-2 border rounded" />
                <input type="text" name="siteName" value={formData.siteName} onChange={handleInputChange} placeholder="Site / Field name" className="md:col-span-2 px-3 py-2 border rounded" />

                <div className="md:col-span-2 flex gap-2">
                  <input type="text" name="gpsCoordinates" value={formData.gpsCoordinates} onChange={handleInputChange} placeholder="GPS coordinates" className="flex-1 px-3 py-2 border rounded" />
                  <button type="button" onClick={getGPS} disabled={gpsStatus === 'loading'} className="bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white px-4 rounded flex items-center gap-2 whitespace-nowrap">
                    {gpsStatus === 'loading' ? <Loader2 size={18} className="animate-spin" /> : <MapPin size={18} />}
                    {gpsStatus === 'loading' ? 'Locating' : 'Get GPS'}
                  </button>
                </div>
                {gpsStatus === 'error' && <div className="md:col-span-2 text-xs text-red-600 -mt-2">Couldn't read location. Allow location access, or type coordinates manually.</div>}

                <select name="category" value={formData.category} onChange={handleInputChange} className="px-3 py-2 border rounded">
                  <option value="">Category *</option>
                  <option value="Research">Research</option>
                  <option value="Extension">Extension</option>
                  <option value="Precision">Precision</option>
                </select>

                <select name="subCategory" value={formData.subCategory} onChange={handleInputChange} disabled={!formData.category} className="px-3 py-2 border rounded disabled:bg-gray-100">
                  <option value="">Sub-Category</option>
                  {formData.category && subCategoryOptions[formData.category]?.map(s => <option key={s} value={s}>{s}</option>)}
                </select>

                <select name="cropType" value={formData.cropType} onChange={handleInputChange} className="px-3 py-2 border rounded">
                  <option value="">Crop Type *</option>
                  {cropTypes.map(t => <option key={t} value={t}>{t}</option>)}
                </select>

                <select name="variety" value={formData.variety} onChange={handleInputChange} disabled={!formData.cropType} className="px-3 py-2 border rounded disabled:bg-gray-100">
                  <option value="">Crop / Variety *</option>
                  {formData.cropType && varietyOptions[formData.cropType]?.map(v => <option key={v} value={v}>{v}</option>)}
                </select>

                <div>
                  <label className="block text-xs text-gray-500 mb-1">Planting date</label>
                  <input type="date" name="plantingDate" value={formData.plantingDate} onChange={handleInputChange} className="w-full px-3 py-2 border rounded" />
                </div>

                <div>
                  <label className="block text-xs text-gray-500 mb-1">Plant health</label>
                  <select name="plantHealth" value={formData.plantHealth} onChange={handleInputChange} className="w-full px-3 py-2 border rounded">
                    <option value="excellent">Excellent</option>
                    <option value="good">Good</option>
                    <option value="fair">Fair</option>
                    <option value="poor">Poor</option>
                  </select>
                </div>
              </div>

              {/* General field photos */}
              <div className="border-t pt-4">
                <div className="flex justify-between items-center mb-3">
                  <h3 className="font-semibold flex items-center gap-2"><ImageIcon size={18} /> Field Photos</h3>
                  <button type="button" onClick={() => generalImgInput.current?.click()} className="bg-teal-600 text-white px-3 py-1 rounded text-sm flex items-center gap-1">
                    <Camera size={14} /> Add Photo
                  </button>
                  <input ref={generalImgInput} type="file" accept="image/*" capture="environment" multiple className="hidden"
                    onChange={(e) => { handleGeneralImages(e.target.files); e.target.value = ''; }} />
                </div>
                {formData.generalImages.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {formData.generalImages.map((src, i) => <Thumb key={i} src={src} onRemove={() => removeGeneralImage(i)} />)}
                  </div>
                )}
              </div>

              {/* Diseases */}
              <div className="border-t pt-4">
                <div className="flex justify-between items-center mb-3">
                  <h3 className="font-semibold">🦠 Diseases</h3>
                  <button type="button" onClick={addDisease} className="bg-red-600 text-white px-3 py-1 rounded text-sm"><Plus size={14} className="inline mr-1" />Add</button>
                </div>
                {formData.diseases.map((dis, idx) => (
                  <div key={idx} className="bg-red-50 p-3 rounded mb-2 border border-red-200">
                    <div className="flex justify-between mb-2">
                      <span className="text-sm font-semibold text-red-900">Disease {idx + 1}</span>
                      <button type="button" onClick={() => removeDisease(idx)} className="text-red-600 hover:bg-red-200 rounded p-1"><X size={16} /></button>
                    </div>

                    <select value={dis.name} onChange={(e) => {
                      const selected = getDiseases().find(d => d.common === e.target.value);
                      updateDisease(idx, 'name', e.target.value);
                      if (selected) updateDisease(idx, 'scientificName', selected.scientific);
                    }} className="w-full px-2 py-1 border rounded text-sm mb-2">
                      <option value="">Select Disease *</option>
                      {getDiseases().map(d => <option key={d.common} value={d.common}>{d.common}</option>)}
                    </select>

                    {showAddDisease === idx ? (
                      <div className="bg-blue-50 border border-blue-300 rounded p-2 mb-2">
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-xs font-semibold text-blue-900">Add New Disease</span>
                          <button type="button" onClick={() => setShowAddDisease(null)} className="text-blue-700"><X size={14} /></button>
                        </div>
                        <input type="text" placeholder="Common name *" value={newDiseaseCommon} onChange={(e) => setNewDiseaseCommon(e.target.value)} className="w-full px-2 py-1 border rounded text-xs mb-2" />
                        <input type="text" placeholder="Scientific name (optional)" value={newDiseaseScientific} onChange={(e) => setNewDiseaseScientific(e.target.value)} className="w-full px-2 py-1 border rounded text-xs mb-2" />
                        <button type="button" onClick={() => addCustomDisease(idx)} className="w-full bg-blue-600 text-white py-1 rounded text-xs">Add Custom Disease</button>
                      </div>
                    ) : (
                      <button type="button" onClick={() => setShowAddDisease(idx)} className="w-full bg-blue-100 border border-blue-300 text-blue-700 py-1 rounded text-xs mb-2">+ Add Custom Disease</button>
                    )}

                    {dis.scientificName && <div className="text-xs italic text-gray-700 bg-gray-100 px-2 py-1 rounded mb-2">{dis.scientificName}</div>}

                    <div className="grid grid-cols-1 gap-2 mb-2">
                      <select value={dis.severity} onChange={(e) => updateDisease(idx, 'severity', e.target.value)} className="px-2 py-1 border rounded text-xs">
                        <option value="mild">Quick note: Mild</option>
                        <option value="moderate">Quick note: Moderate</option>
                        <option value="severe">Quick note: Severe</option>
                      </select>
                    </div>

                    {/* Quantitative rating scale */}
                    <div className="bg-white border border-gray-200 rounded p-2 mb-2">
                      <div className="flex items-center gap-2 mb-2">
                        <select value={dis.ratingScale || ''} onChange={(e) => updateDiseaseScale(idx, e.target.value)} className="flex-1 px-2 py-1 border rounded text-xs">
                          <option value="">Rating scale for scoring…</option>
                          {Object.entries(diseaseScales).map(([k, s]) => <option key={k} value={k}>{s.name}</option>)}
                        </select>
                        {dis.ratingScale && (
                          <button type="button" onClick={() => setOpenLegend(openLegend === `d${idx}` ? null : `d${idx}`)} className="text-xs text-blue-700 underline whitespace-nowrap">
                            {openLegend === `d${idx}` ? 'Hide key' : 'Scale key'}
                          </button>
                        )}
                      </div>

                      {dis.ratingScale && openLegend === `d${idx}` && (
                        <div className="bg-blue-50 border border-blue-200 rounded p-2 mb-2 text-[11px] leading-snug text-gray-700">
                          {diseaseScales[dis.ratingScale].grades.map(g => (
                            <div key={g}><span className="font-semibold">{g}</span> — {diseaseScales[dis.ratingScale].legend[g]}</div>
                          ))}
                        </div>
                      )}

                      {dis.ratingScale && (
                        <>
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-[11px] text-gray-500">Scored over</span>
                            <select value={dis.scoreUnit || 'Plants'} onChange={(e) => updateDisease(idx, 'scoreUnit', e.target.value)} className="px-2 py-1 border rounded text-xs">
                              {scoreUnits.map(u => <option key={u} value={u}>{u}</option>)}
                            </select>
                          </div>
                          <div className="text-[11px] text-gray-500 mb-1">No. of {(dis.scoreUnit || 'Plants').toLowerCase()} observed in each grade:</div>
                          <div className="grid grid-cols-6 gap-1 mb-2">
                            {diseaseScales[dis.ratingScale].grades.map(g => (
                              <div key={g} className="text-center">
                                <div className="text-[10px] text-gray-500">Gr {g}</div>
                                <input type="number" min="0" inputMode="numeric" value={(dis.gradeCounts && dis.gradeCounts[g]) || ''} onChange={(e) => updateDiseaseGrade(idx, g, e.target.value)} className="w-full px-1 py-1 border rounded text-xs text-center" />
                              </div>
                            ))}
                          </div>
                          {(() => {
                            const sd = diseaseScales[dis.ratingScale];
                            const m = computeMetrics(dis.gradeCounts, sd);
                            const rx = diseaseReaction(m, sd.type);
                            if (!m || m.total === 0) return <div className="text-[11px] text-gray-400">Enter {(dis.scoreUnit || 'Plants').toLowerCase()} counts to compute indices.</div>;
                            return (
                              <div className="flex flex-wrap gap-1 text-[11px]">
                                <span className="bg-gray-100 px-2 py-0.5 rounded">n = {m.total} {(dis.scoreUnit || 'Plants').toLowerCase()}</span>
                                <span className="bg-gray-100 px-2 py-0.5 rounded">Incidence {m.incidence}%</span>
                                <span className="bg-gray-100 px-2 py-0.5 rounded">Severity Index {m.dsi}%</span>
                                {sd.type === 'viral' && <span className="bg-gray-100 px-2 py-0.5 rounded">CI {m.ci}</span>}
                                {rx && <span className={`px-2 py-0.5 rounded font-semibold ${rx.cls}`}>{rx.code} · {rx.label}</span>}
                              </div>
                            );
                          })()}
                        </>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <label className="inline-flex items-center gap-1 bg-red-100 border border-red-300 text-red-800 px-2 py-1 rounded text-xs cursor-pointer">
                        <Camera size={13} /> Add Photo
                        <input type="file" accept="image/*" capture="environment" multiple className="hidden"
                          onChange={(e) => { handleDiseaseImages(idx, e.target.files); e.target.value = ''; }} />
                      </label>
                      <button type="button" onClick={() => openScan(idx)} className="inline-flex items-center gap-1 bg-teal-600 hover:bg-teal-700 text-white px-2 py-1 rounded text-xs">
                        <ScanLine size={13} /> Scan &amp; measure
                      </button>
                      {dis.measuredSeverity != null && <span className="text-[11px] text-teal-700 bg-teal-50 border border-teal-200 px-2 py-0.5 rounded">Last scan: {dis.measuredSeverity}% diseased area</span>}
                    </div>
                    {dis.images && dis.images.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {dis.images.map((src, j) => <Thumb key={j} src={src} onRemove={() => removeDiseaseImage(idx, j)} />)}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Pests */}
              <div className="border-t pt-4">
                <div className="flex justify-between items-center mb-3">
                  <h3 className="font-semibold">🐛 Pests</h3>
                  <button type="button" onClick={addPest} className="bg-orange-600 text-white px-3 py-1 rounded text-sm"><Plus size={14} className="inline mr-1" />Add</button>
                </div>
                {formData.pests.map((pest, idx) => (
                  <div key={idx} className="bg-orange-50 p-3 rounded mb-2 border border-orange-200">
                    <div className="flex justify-between mb-2">
                      <span className="text-sm font-semibold text-orange-900">Pest {idx + 1}</span>
                      <button type="button" onClick={() => removePest(idx)} className="text-orange-600 hover:bg-orange-200 rounded p-1"><X size={16} /></button>
                    </div>

                    <select value={pest.name} onChange={(e) => {
                      const selected = getPests().find(p => p.common === e.target.value);
                      updatePest(idx, 'name', e.target.value);
                      if (selected) updatePest(idx, 'scientificName', selected.scientific);
                    }} className="w-full px-2 py-1 border rounded text-sm mb-2">
                      <option value="">Select Pest *</option>
                      {getPests().map(p => <option key={p.common} value={p.common}>{p.common}</option>)}
                    </select>

                    {showAddPest === idx ? (
                      <div className="bg-blue-50 border border-blue-300 rounded p-2 mb-2">
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-xs font-semibold text-blue-900">Add New Pest</span>
                          <button type="button" onClick={() => setShowAddPest(null)} className="text-blue-700"><X size={14} /></button>
                        </div>
                        <input type="text" placeholder="Common name *" value={newPestCommon} onChange={(e) => setNewPestCommon(e.target.value)} className="w-full px-2 py-1 border rounded text-xs mb-2" />
                        <input type="text" placeholder="Scientific name (optional)" value={newPestScientific} onChange={(e) => setNewPestScientific(e.target.value)} className="w-full px-2 py-1 border rounded text-xs mb-2" />
                        <button type="button" onClick={() => addCustomPest(idx)} className="w-full bg-blue-600 text-white py-1 rounded text-xs">Add Custom Pest</button>
                      </div>
                    ) : (
                      <button type="button" onClick={() => setShowAddPest(idx)} className="w-full bg-blue-100 border border-blue-300 text-blue-700 py-1 rounded text-xs mb-2">+ Add Custom Pest</button>
                    )}

                    {pest.scientificName && <div className="text-xs italic text-gray-700 bg-gray-100 px-2 py-1 rounded mb-2">{pest.scientificName}</div>}

                    <div className="grid grid-cols-1 gap-2 mb-2">
                      <select value={pest.infestation} onChange={(e) => updatePest(idx, 'infestation', e.target.value)} className="px-2 py-1 border rounded text-xs">
                        <option value="low">Quick note: Low</option>
                        <option value="moderate">Quick note: Moderate</option>
                        <option value="high">Quick note: High</option>
                      </select>
                    </div>

                    {/* Quantitative rating scale */}
                    <div className="bg-white border border-gray-200 rounded p-2 mb-2">
                      <div className="flex items-center gap-2 mb-2">
                        <select value={pest.ratingScale || ''} onChange={(e) => updatePestScale(idx, e.target.value)} className="flex-1 px-2 py-1 border rounded text-xs">
                          <option value="">Rating scale for scoring…</option>
                          {Object.entries(pestScales).map(([k, s]) => <option key={k} value={k}>{s.name}</option>)}
                        </select>
                        {pest.ratingScale && (
                          <button type="button" onClick={() => setOpenLegend(openLegend === `p${idx}` ? null : `p${idx}`)} className="text-xs text-blue-700 underline whitespace-nowrap">
                            {openLegend === `p${idx}` ? 'Hide key' : 'Scale key'}
                          </button>
                        )}
                      </div>

                      {pest.ratingScale && openLegend === `p${idx}` && (
                        <div className="bg-blue-50 border border-blue-200 rounded p-2 mb-2 text-[11px] leading-snug text-gray-700">
                          {pestScales[pest.ratingScale].grades.map(g => (
                            <div key={g}><span className="font-semibold">{g}</span> — {pestScales[pest.ratingScale].legend[g]}</div>
                          ))}
                        </div>
                      )}

                      {pest.ratingScale && (
                        <>
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-[11px] text-gray-500">Scored over</span>
                            <select value={pest.scoreUnit || 'Plants'} onChange={(e) => updatePest(idx, 'scoreUnit', e.target.value)} className="px-2 py-1 border rounded text-xs">
                              {scoreUnits.map(u => <option key={u} value={u}>{u}</option>)}
                            </select>
                          </div>
                          <div className="text-[11px] text-gray-500 mb-1">No. of {(pest.scoreUnit || 'Plants').toLowerCase()} observed in each damage grade:</div>
                          <div className="grid grid-cols-6 gap-1 mb-2">
                            {pestScales[pest.ratingScale].grades.map(g => (
                              <div key={g} className="text-center">
                                <div className="text-[10px] text-gray-500">Gr {g}</div>
                                <input type="number" min="0" inputMode="numeric" value={(pest.gradeCounts && pest.gradeCounts[g]) || ''} onChange={(e) => updatePestGrade(idx, g, e.target.value)} className="w-full px-1 py-1 border rounded text-xs text-center" />
                              </div>
                            ))}
                          </div>
                          {(() => {
                            const sd = pestScales[pest.ratingScale];
                            const m = computeMetrics(pest.gradeCounts, sd);
                            const cat = pestCategory(m);
                            if (!m || m.total === 0) return <div className="text-[11px] text-gray-400">Enter {(pest.scoreUnit || 'Plants').toLowerCase()} counts to compute indices.</div>;
                            return (
                              <div className="flex flex-wrap gap-1 text-[11px]">
                                <span className="bg-gray-100 px-2 py-0.5 rounded">n = {m.total} {(pest.scoreUnit || 'Plants').toLowerCase()}</span>
                                <span className="bg-gray-100 px-2 py-0.5 rounded">Infestation {m.incidence}%</span>
                                <span className="bg-gray-100 px-2 py-0.5 rounded">Damage Index {m.dsi}%</span>
                                {cat && <span className={`px-2 py-0.5 rounded font-semibold ${cat.cls}`}>{cat.label}</span>}
                              </div>
                            );
                          })()}
                        </>
                      )}
                      <input type="text" placeholder="Mean population (no. per plant / leaf / trap) – optional" value={pest.population || ''} onChange={(e) => updatePest(idx, 'population', e.target.value)} className="w-full px-2 py-1 border rounded text-xs mt-2" />
                    </div>

                    <label className="inline-flex items-center gap-1 bg-orange-100 border border-orange-300 text-orange-800 px-2 py-1 rounded text-xs cursor-pointer">
                      <Camera size={13} /> Add Photo
                      <input type="file" accept="image/*" capture="environment" multiple className="hidden"
                        onChange={(e) => { handlePestImages(idx, e.target.files); e.target.value = ''; }} />
                    </label>
                    {pest.images && pest.images.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {pest.images.map((src, j) => <Thumb key={j} src={src} onRemove={() => removePestImage(idx, j)} />)}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Growth & Yield parameters */}
              <div className="border-t pt-4">
                <h3 className="font-semibold mb-3">📏 Growth Parameters</h3>
                <select value="" onChange={(e) => { if (!e.target.value) return; if (e.target.value === '__custom__') addGrowthParam(null); else addGrowthParam(getGrowthParams().find(p => p.name === e.target.value)); e.target.value = ''; }} className="w-full px-2 py-2 border rounded text-sm mb-2">
                  <option value="">+ Add growth parameter…</option>
                  {getGrowthParams().map(p => <option key={p.name} value={p.name}>{p.name} ({p.unit})</option>)}
                  <option value="__custom__">Custom parameter…</option>
                </select>
                {formData.growthParams.map((g, idx) => (
                  <div key={idx} className="flex items-center gap-2 mb-2">
                    {g.name && getGrowthParams().some(p => p.name === g.name) ? (
                      <span className="flex-1 text-sm">{g.name}</span>
                    ) : (
                      <input type="text" placeholder="Parameter name" value={g.name} onChange={(e) => updateGrowthParam(idx, 'name', e.target.value)} className="flex-1 px-2 py-1 border rounded text-sm" />
                    )}
                    <input type="text" inputMode="decimal" placeholder="Value" value={g.value} onChange={(e) => updateGrowthParam(idx, 'value', e.target.value)} className="w-24 px-2 py-1 border rounded text-sm" />
                    <input type="text" placeholder="unit" value={g.unit} onChange={(e) => updateGrowthParam(idx, 'unit', e.target.value)} className="w-16 px-2 py-1 border rounded text-xs text-gray-600" />
                    <button type="button" onClick={() => removeGrowthParam(idx)} className="text-gray-400 hover:text-red-600 p-1"><X size={16} /></button>
                  </div>
                ))}

                <h3 className="font-semibold mb-3 mt-4">🌾 Yield Parameters</h3>
                <select value="" onChange={(e) => { if (!e.target.value) return; if (e.target.value === '__custom__') addYieldParam(null); else addYieldParam(getYieldParams().find(p => p.name === e.target.value)); e.target.value = ''; }} className="w-full px-2 py-2 border rounded text-sm mb-2">
                  <option value="">+ Add yield parameter…</option>
                  {getYieldParams().map(p => <option key={p.name} value={p.name}>{p.name} ({p.unit})</option>)}
                  <option value="__custom__">Custom parameter…</option>
                </select>
                {formData.yieldParams.map((y, idx) => (
                  <div key={idx} className="flex items-center gap-2 mb-2">
                    {y.name && getYieldParams().some(p => p.name === y.name) ? (
                      <span className="flex-1 text-sm">{y.name}</span>
                    ) : (
                      <input type="text" placeholder="Parameter name" value={y.name} onChange={(e) => updateYieldParam(idx, 'name', e.target.value)} className="flex-1 px-2 py-1 border rounded text-sm" />
                    )}
                    <input type="text" inputMode="decimal" placeholder="Value" value={y.value} onChange={(e) => updateYieldParam(idx, 'value', e.target.value)} className="w-24 px-2 py-1 border rounded text-sm" />
                    <input type="text" placeholder="unit" value={y.unit} onChange={(e) => updateYieldParam(idx, 'unit', e.target.value)} className="w-16 px-2 py-1 border rounded text-xs text-gray-600" />
                    <button type="button" onClick={() => removeYieldParam(idx)} className="text-gray-400 hover:text-red-600 p-1"><X size={16} /></button>
                  </div>
                ))}
              </div>

              <textarea name="notes" value={formData.notes} onChange={handleInputChange} rows="3" placeholder="Additional observations / agronomic notes..." className="w-full px-3 py-2 border rounded text-sm" />

              <button type="button" onClick={handleSubmit} className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-lg">
                <Save size={20} className="inline mr-2" />{editingId ? 'Update Record' : 'Save Record'}
              </button>
            </div>
          </div>
        )}

        {view === 'records' && (
        <>
        {records.length > 0 && (
          <div className="bg-white rounded-xl shadow p-3 mb-4 flex flex-wrap gap-2 items-center">
            <div className="relative flex-1 min-w-[160px]">
              <Search size={16} className="absolute left-2 top-2.5 text-gray-400" />
              <input value={searchText} onChange={(e) => setSearchText(e.target.value)} placeholder="Search farmer, crop, disease, location…" className="w-full pl-8 pr-2 py-2 border rounded text-sm" />
            </div>
            <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} className="px-2 py-2 border rounded text-sm">
              <option value="">All categories</option>
              <option value="Research">Research</option>
              <option value="Extension">Extension</option>
              <option value="Precision">Precision</option>
            </select>
            <select value={filterCrop} onChange={(e) => setFilterCrop(e.target.value)} className="px-2 py-2 border rounded text-sm">
              <option value="">All crops</option>
              {cropList.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="px-2 py-2 border rounded text-sm">
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="farmer">Farmer A–Z</option>
              <option value="variety">Crop A–Z</option>
            </select>
          </div>
        )}

        <div className="space-y-4">
          {loading ? (
            <div className="bg-white rounded-xl shadow p-8 text-center text-gray-500 flex items-center justify-center gap-2">
              <Loader2 size={20} className="animate-spin" /> Loading records...
            </div>
          ) : records.length === 0 ? (
            <div className="bg-white rounded-xl shadow p-8 text-center">
              <Eye size={48} className="mx-auto text-gray-400 mb-4" />
              <p className="text-gray-600">No records yet. Tap “New Record” to log your first field observation.</p>
            </div>
          ) : visibleRecords.length === 0 ? (
            <div className="bg-white rounded-xl shadow p-8 text-center">
              <Search size={40} className="mx-auto text-gray-400 mb-3" />
              <p className="text-gray-600">No records match your search or filters.</p>
            </div>
          ) : (
            visibleRecords.map(rec => {
              const photoCount = (rec.generalImages || []).length
                + (rec.diseases || []).reduce((s, d) => s + (d.images ? d.images.length : 0), 0)
                + (rec.pests || []).reduce((s, p) => s + (p.images ? p.images.length : 0), 0);
              return (
                <div key={rec.id} className="bg-white rounded-xl shadow-lg overflow-hidden">
                  <div onClick={() => setExpandedRecord(expandedRecord === rec.id ? null : rec.id)} className="p-4 cursor-pointer hover:bg-gray-50">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          <span className="bg-green-100 text-green-800 px-3 py-1 rounded-full text-xs font-semibold">{rec.recordNumber}</span>
                          <span className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-xs font-semibold">{rec.variety}</span>
                          {rec.category && <span className="bg-purple-100 text-purple-800 px-3 py-1 rounded-full text-xs">{rec.category}</span>}
                          {rec.diseases.length > 0 && <span className="bg-red-100 text-red-800 px-3 py-1 rounded-full text-xs">{rec.diseases.length}D</span>}
                          {rec.pests.length > 0 && <span className="bg-orange-100 text-orange-800 px-3 py-1 rounded-full text-xs">{rec.pests.length}P</span>}
                          {photoCount > 0 && <span className="bg-teal-100 text-teal-800 px-3 py-1 rounded-full text-xs flex items-center gap-1"><ImageIcon size={11} />{photoCount}</span>}
                        </div>
                        <h3 className="font-bold text-lg">{rec.farmerName}</h3>
                        <p className="text-sm text-gray-600">{rec.location}{rec.siteName ? ` • ${rec.siteName}` : ''}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        <button onClick={(e) => { e.stopPropagation(); startEdit(rec); }} className="text-blue-600 hover:bg-blue-50 p-2 rounded-lg"><Pencil size={18} /></button>
                        <button onClick={(e) => { e.stopPropagation(); deleteRecord(rec.id); }} className="text-red-600 hover:bg-red-50 p-2 rounded-lg"><Trash2 size={18} /></button>
                        {expandedRecord === rec.id ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                      </div>
                    </div>
                  </div>
                  {expandedRecord === rec.id && (
                    <div className="p-4 bg-gray-50 border-t space-y-3">
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                        <div><span className="text-gray-500">Farmer ID:</span> {rec.farmerId}</div>
                        <div><span className="text-gray-500">Crop type:</span> {rec.cropType}</div>
                        {rec.subCategory && <div><span className="text-gray-500">Sub-category:</span> {rec.subCategory}</div>}
                        {rec.plantingDate && <div><span className="text-gray-500">Planting:</span> {rec.plantingDate}</div>}
                        {rec.gpsCoordinates && <div className="col-span-2"><span className="text-gray-500">GPS:</span> {rec.gpsCoordinates}</div>}
                        <div className="col-span-2">
                          <span className="text-gray-500">Plant health:</span>{' '}
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${healthColor[rec.plantHealth] || 'bg-gray-100 text-gray-700'}`}>{rec.plantHealth}</span>
                        </div>
                      </div>

                      {rec.generalImages && rec.generalImages.length > 0 && (
                        <div>
                          <h4 className="font-semibold text-gray-700 mb-2">Field photos:</h4>
                          <div className="flex flex-wrap gap-2">{rec.generalImages.map((src, i) => <Thumb key={i} src={src} />)}</div>
                        </div>
                      )}

                      {rec.diseases.length > 0 && (
                        <div>
                          <h4 className="font-semibold text-red-800 mb-2">Diseases:</h4>
                          {rec.diseases.map((d, i) => (
                            <div key={i} className="bg-red-50 p-2 rounded mb-2 text-sm border border-red-200">
                              <div className="font-medium text-red-900">{d.name}</div>
                              {d.scientificName && <div className="text-xs italic text-gray-600 mt-1">{d.scientificName}</div>}
                              {d.measuredSeverity != null && <div className="text-[11px] text-teal-700 mt-1">Scan: {d.measuredSeverity}% diseased leaf area</div>}
                              {(() => {
                                const sd = d.ratingScale ? diseaseScales[d.ratingScale] : null;
                                if (sd) {
                                  const m = computeMetrics(d.gradeCounts, sd);
                                  const rx = diseaseReaction(m, sd.type);
                                  return (
                                    <div className="text-xs text-gray-700 mt-1 flex flex-wrap gap-x-2 gap-y-1 items-center">
                                      <span className="bg-white border px-1.5 py-0.5 rounded">{sd.short}</span>
                                      <span>n={m.total} {(d.scoreUnit || 'plants').toLowerCase()}</span>
                                      <span>Incidence {m.incidence}%</span>
                                      <span>Severity {m.dsi}%</span>
                                      {sd.type === 'viral' && <span>CI {m.ci}</span>}
                                      {rx && <span className={`px-1.5 py-0.5 rounded font-semibold ${rx.cls}`}>{rx.code} {rx.label}</span>}
                                    </div>
                                  );
                                }
                                return (
                                  <div className="text-xs text-gray-700 mt-1">
                                    Severity: {d.severity}{d.scale ? ` | Scale: ${d.scale}/5` : ''}{d.percentAffected ? ` | Affected: ${d.percentAffected}%` : ''}
                                  </div>
                                );
                              })()}
                              {d.images && d.images.length > 0 && <div className="flex flex-wrap gap-2 mt-2">{d.images.map((src, j) => <Thumb key={j} src={src} />)}</div>}
                            </div>
                          ))}
                        </div>
                      )}

                      {rec.pests.length > 0 && (
                        <div>
                          <h4 className="font-semibold text-orange-800 mb-2">Pests:</h4>
                          {rec.pests.map((p, i) => (
                            <div key={i} className="bg-orange-50 p-2 rounded mb-2 text-sm border border-orange-200">
                              <div className="font-medium text-orange-900">{p.name}</div>
                              {p.scientificName && <div className="text-xs italic text-gray-600 mt-1">{p.scientificName}</div>}
                              {(() => {
                                const sd = p.ratingScale ? pestScales[p.ratingScale] : null;
                                if (sd) {
                                  const m = computeMetrics(p.gradeCounts, sd);
                                  const cat = pestCategory(m);
                                  return (
                                    <div className="text-xs text-gray-700 mt-1 flex flex-wrap gap-x-2 gap-y-1 items-center">
                                      <span className="bg-white border px-1.5 py-0.5 rounded">{sd.short}</span>
                                      <span>n={m.total} {(p.scoreUnit || 'plants').toLowerCase()}</span>
                                      <span>Infestation {m.incidence}%</span>
                                      <span>Damage {m.dsi}%</span>
                                      {p.population ? <span>Pop. {p.population}</span> : null}
                                      {cat && <span className={`px-1.5 py-0.5 rounded font-semibold ${cat.cls}`}>{cat.label}</span>}
                                    </div>
                                  );
                                }
                                return <div className="text-xs text-gray-700 mt-1">Infestation: {p.infestation}{p.scale ? ` | Scale: ${p.scale}/5` : ''}{p.population ? ` | Pop: ${p.population}` : ''}</div>;
                              })()}
                              {p.images && p.images.length > 0 && <div className="flex flex-wrap gap-2 mt-2">{p.images.map((src, j) => <Thumb key={j} src={src} />)}</div>}
                            </div>
                          ))}
                        </div>
                      )}

                      {((rec.growthParams && rec.growthParams.filter(g => g.name && g.value !== '').length > 0) || (rec.yieldParams && rec.yieldParams.filter(y => y.name && y.value !== '').length > 0)) && (
                        <div className="grid md:grid-cols-2 gap-3">
                          {rec.growthParams && rec.growthParams.filter(g => g.name && g.value !== '').length > 0 && (
                            <div>
                              <h4 className="font-semibold text-green-800 mb-2">Growth:</h4>
                              <div className="bg-green-50 border border-green-200 rounded p-2 text-sm">
                                {rec.growthParams.filter(g => g.name && g.value !== '').map((g, i) => (
                                  <div key={i} className="flex justify-between py-0.5 border-b border-green-100 last:border-0">
                                    <span className="text-gray-700">{g.name}</span><span className="font-medium">{g.value} {g.unit}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          {rec.yieldParams && rec.yieldParams.filter(y => y.name && y.value !== '').length > 0 && (
                            <div>
                              <h4 className="font-semibold text-amber-800 mb-2">Yield:</h4>
                              <div className="bg-amber-50 border border-amber-200 rounded p-2 text-sm">
                                {rec.yieldParams.filter(y => y.name && y.value !== '').map((y, i) => (
                                  <div key={i} className="flex justify-between py-0.5 border-b border-amber-100 last:border-0">
                                    <span className="text-gray-700">{y.name}</span><span className="font-medium">{y.value} {y.unit}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {rec.notes && (
                        <div className="bg-gray-100 p-2 rounded text-sm">
                          <span className="font-semibold">Notes:</span> {rec.notes}
                        </div>
                      )}
                      <div className="text-xs text-gray-400 pt-1">Logged {new Date(rec.timestamp).toLocaleString()}{rec.updatedAt ? ` · edited ${new Date(rec.updatedAt).toLocaleString()}` : ''}</div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
        </>
        )}

        {view === 'summary' && (
          <div className="space-y-4">
            {summary.varieties.length === 0 ? (
              <div className="bg-white rounded-xl shadow p-8 text-center text-gray-500">
                <BarChart3 size={40} className="mx-auto text-gray-400 mb-3" />
                Nothing to summarise yet. Add records (with rating scales scored) to see resistance rankings.
              </div>
            ) : (
              <>
                <div className="bg-white rounded-xl shadow p-4">
                  <h3 className="font-bold text-gray-800 mb-1 flex items-center gap-2"><Award size={18} /> Crop / genotype resistance ranking</h3>
                  <p className="text-xs text-gray-500 mb-3">Mean across scored disease observations · sorted most resistant first (lowest severity index). Reaction from mean PDI.</p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-gray-500 border-b">
                          <th className="py-1 pr-2">Crop / Variety</th>
                          <th className="py-1 px-2 text-center">Recs</th>
                          <th className="py-1 px-2 text-center">Obs</th>
                          <th className="py-1 px-2 text-center">Incidence</th>
                          <th className="py-1 px-2 text-center">Severity (PDI)</th>
                          <th className="py-1 px-2 text-center">CI</th>
                          <th className="py-1 px-2 text-center">Reaction</th>
                        </tr>
                      </thead>
                      <tbody>
                        {summary.varieties.map(v => (
                          <tr key={v.variety} className="border-b last:border-0">
                            <td className="py-1 pr-2 font-medium">{v.variety}</td>
                            <td className="py-1 px-2 text-center">{v.records}</td>
                            <td className="py-1 px-2 text-center">{v.obs || '—'}</td>
                            <td className="py-1 px-2 text-center">{v.obs ? `${v.meanInc}%` : '—'}</td>
                            <td className="py-1 px-2 text-center">{v.obs ? `${v.meanDsi}%` : '—'}</td>
                            <td className="py-1 px-2 text-center">{v.meanCi != null ? v.meanCi : '—'}</td>
                            <td className="py-1 px-2 text-center">{v.rx ? <span className={`px-1.5 py-0.5 rounded text-xs font-semibold ${v.rx.cls}`}>{v.rx.code}</span> : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-[11px] text-gray-400 mt-2">I = Immune · HR Highly Resistant · R Resistant · MR Moderately Resistant · MS Moderately Susceptible · S Susceptible · HS Highly Susceptible</p>
                </div>

                {chartData.length > 0 && (
                  <div className="bg-white rounded-xl shadow p-4">
                    <h3 className="font-bold text-gray-800 mb-3 flex items-center gap-2"><BarChart3 size={18} /> Mean severity index (PDI %) by crop</h3>
                    <div style={{ width: '100%', height: Math.max(160, chartData.length * 40) }}>
                      <ResponsiveContainer>
                        <BarChart data={chartData} layout="vertical" margin={{ left: 10, right: 24, top: 4, bottom: 4 }}>
                          <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} />
                          <YAxis type="category" dataKey="name" width={92} tick={{ fontSize: 11 }} />
                          <Tooltip formatter={(val) => [`${val}% PDI`, 'Severity']} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
                          <Bar dataKey="pdi" radius={[0, 4, 4, 0]}>
                            {chartData.map((d, i) => <Cell key={i} fill={d.color} />)}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <p className="text-[11px] text-gray-400 mt-1">Bar colour reflects the resistance reaction (green = resistant → red = highly susceptible).</p>
                  </div>
                )}

                <div className="grid md:grid-cols-2 gap-4">
                  <div className="bg-white rounded-xl shadow p-4">
                    <h3 className="font-bold text-red-800 mb-2">Most-recorded diseases</h3>
                    {summary.topDiseases.length === 0 ? <p className="text-sm text-gray-400">None recorded.</p> :
                      summary.topDiseases.map(([name, n]) => (
                        <div key={name} className="flex justify-between text-sm py-0.5 border-b last:border-0">
                          <span>{name}</span><span className="text-gray-500">{n}</span>
                        </div>
                      ))}
                  </div>
                  <div className="bg-white rounded-xl shadow p-4">
                    <h3 className="font-bold text-orange-800 mb-2">Most-recorded pests</h3>
                    {summary.topPests.length === 0 ? <p className="text-sm text-gray-400">None recorded.</p> :
                      summary.topPests.map(([name, n]) => (
                        <div key={name} className="flex justify-between text-sm py-0.5 border-b last:border-0">
                          <span>{name}</span><span className="text-gray-500">{n}</span>
                        </div>
                      ))}
                  </div>
                </div>

                {summary.paramMeans.length > 0 && (
                  <div className="bg-white rounded-xl shadow p-4">
                    <h3 className="font-bold text-gray-800 mb-3 flex items-center gap-2"><Award size={18} /> Growth &amp; yield means by crop</h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-gray-500 border-b">
                            <th className="py-1 pr-2">Crop</th>
                            <th className="py-1 px-2">Type</th>
                            <th className="py-1 px-2">Parameter</th>
                            <th className="py-1 px-2 text-right">Mean</th>
                            <th className="py-1 px-2 text-center">n</th>
                          </tr>
                        </thead>
                        <tbody>
                          {summary.paramMeans.map((p, i) => (
                            <tr key={i} className="border-b last:border-0">
                              <td className="py-1 pr-2 font-medium">{p.crop}</td>
                              <td className="py-1 px-2">
                                <span className={`px-1.5 py-0.5 rounded text-xs ${p.kind === 'growth' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>{p.kind}</span>
                              </td>
                              <td className="py-1 px-2">{p.name}</td>
                              <td className="py-1 px-2 text-right font-medium">{p.mean} {p.unit}</td>
                              <td className="py-1 px-2 text-center text-gray-500">{p.n}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {scanState && (() => {
        const d = formData.diseases[scanState.idx] || {};
        const sk = d.ratingScale;
        const canGrade = !!diseasePctMaps[sk];
        const sShort = sk && diseaseScales[sk] ? diseaseScales[sk].short : '';
        return (
          <LeafScan
            src={scanState.src}
            scaleShort={sShort}
            canGrade={canGrade}
            mapGrade={(pct) => mapPercentToGrade(sk, pct)}
            unit={unitSingular(d.scoreUnit || 'Plants')}
            onApply={applyScan}
            onClose={() => setScanState(null)}
          />
        );
      })()}
      {aboutOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-3" onClick={() => setAboutOpen(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center p-4 border-b sticky top-0 bg-white">
              <h3 className="font-bold text-gray-800">About HortiScan</h3>
              <button onClick={() => setAboutOpen(false)} className="text-gray-400 hover:text-gray-700"><X size={20} /></button>
            </div>
            <div className="p-4 space-y-4 text-sm text-gray-700">
              <div>
                <div className="text-lg font-bold text-green-700">🌱 HortiScan</div>
                <div className="text-xs text-gray-500">Version {APP_VERSION} · Research • Extension • Precision Horticulture</div>
                <div className="mt-2">Developed by <span className="font-semibold">Dr. T. Rajasekharam</span>, Senior Scientist (Plant Pathology), Horticultural Research Station, Dr. YSR Horticultural University.</div>
              </div>

              <div className="bg-green-50 border border-green-200 rounded p-3">
                <div className="font-semibold text-green-800 mb-1">Licence — free to use &amp; share</div>
                <p className="text-xs">HortiScan is free and open-source software released under the <span className="font-semibold">MIT License</span>. You may use, copy, modify, and distribute it freely, provided this notice is retained.</p>
                <details className="mt-2">
                  <summary className="text-xs text-green-700 cursor-pointer">Full MIT Licence text</summary>
                  <pre className="text-[10px] whitespace-pre-wrap mt-2 text-gray-600">{MIT_LICENSE_TEXT}</pre>
                </details>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded p-3">
                <div className="font-semibold text-amber-800 mb-1">Disclaimer</div>
                <p className="text-xs">This is a decision-support tool. Disease/pest identifications, image-based severity measurements, and computed indices are indicative and should be verified by a qualified plant pathologist and, where needed, by laboratory confirmation. It is not a substitute for professional diagnosis or judgement. The authors accept no liability for decisions taken based on its output.</p>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded p-3">
                <div className="font-semibold text-blue-800 mb-1">Data &amp; privacy</div>
                <p className="text-xs">All records — including farmer details, GPS coordinates, and photographs — are stored only on this device and are never uploaded anywhere by the app. You are responsible for the data you collect, for obtaining any consent required, and for handling it in line with applicable data-protection rules. Use <span className="font-semibold">Export</span> regularly to back up your data.</p>
              </div>

              <div>
                <div className="font-semibold text-gray-800 mb-1">Open-source components</div>
                <p className="text-xs text-gray-500 mb-2">HortiScan is built with the following open-source libraries, used under the MIT License — © their respective authors:</p>
                <div className="space-y-0.5">
                  {OSS_COMPONENTS.map(([name, holder]) => (
                    <div key={name} className="flex justify-between text-xs border-b border-gray-100 py-0.5">
                      <span>{name}</span><span className="text-gray-500">© {holder}</span>
                    </div>
                  ))}
                </div>
                <button
                  onClick={async () => {
                    if (ossText) { setOssText(null); return; }
                    try {
                      const r = await fetch('THIRD-PARTY-LICENSES.txt');
                      setOssText(r.ok ? await r.text() : 'Full third-party licence texts are bundled with the app package.');
                    } catch (e) {
                      setOssText('Full third-party licence texts are bundled with the app package.');
                    }
                  }}
                  className="mt-2 text-xs text-blue-700 underline"
                >
                  {ossText ? 'Hide full licences' : 'View full open-source licences'}
                </button>
                {ossText && <pre className="text-[10px] whitespace-pre-wrap mt-2 text-gray-600 max-h-48 overflow-y-auto bg-gray-50 border rounded p-2">{ossText}</pre>}
              </div>

              <div className="text-[11px] text-gray-400 text-center pt-1">© 2026 Dr. T. Rajasekharam · Dr. YSR Horticultural University</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default HorticultureDataApp;
