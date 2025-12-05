import React, { useState, useRef, useEffect } from 'react';
import { EditMode, ProcessingState, LogoState } from './types';
import { editImageWithGemini, fileToGenerativePart } from './services/geminiService';
import { Icons } from './components/Icon';
import { LoadingOverlay } from './components/LoadingOverlay';

// Preset colors for background replacement
const PRESET_COLORS = [
  { name: 'White', hex: '#FFFFFF' },
  { name: 'Black', hex: '#000000' },
  { name: 'Red', hex: '#ef4444' },
  { name: 'Blue', hex: '#3b82f6' },
  { name: 'Green', hex: '#22c55e' },
  { name: 'Yellow', hex: '#eab308' },
  { name: 'Purple', hex: '#a855f7' },
  { name: 'Pink', hex: '#ec4899' },
];

const SCENE_PRESETS = [
  { name: 'Professional Studio', prompt: 'a professional clean photo studio background with soft lighting' },
  { name: 'Office Blur', prompt: 'a modern blurred corporate office background' },
  { name: 'Sunny Beach', prompt: 'a beautiful sunny beach with blue ocean and sky' },
  { name: 'Nature', prompt: 'a lush green forest nature background' },
  { name: 'Cyberpunk', prompt: 'a neon-lit cyberpunk city street at night' },
  { name: 'Luxury Interior', prompt: 'a luxury living room interior with modern furniture' },
  { name: 'Minimalist', prompt: 'a minimalist aesthetic background with soft shadows' },
];

const App: React.FC = () => {
  // --- State ---
  const [originalImage, setOriginalImage] = useState<File | null>(null);
  const [currentImageUrl, setCurrentImageUrl] = useState<string | null>(null);
  const [mode, setMode] = useState<EditMode>(EditMode.IDLE);
  const [processing, setProcessing] = useState<ProcessingState>({ isProcessing: false, message: '' });
  
  // Prompt Input State
  const [promptInput, setPromptInput] = useState<string>('');
  
  // Mask Drawing State
  const [brushSize, setBrushSize] = useState<number>(30);
  const [isDrawing, setIsDrawing] = useState<boolean>(false);
  const [hasMask, setHasMask] = useState<boolean>(false);
  
  // Cursor State
  const [isHoveringCanvas, setIsHoveringCanvas] = useState<boolean>(false);
  const brushCursorRef = useRef<HTMLDivElement>(null);

  // Mask History for Undo
  const maskHistoryRef = useRef<ImageData[]>([]);
  
  // Background UI State
  const [bgTab, setBgTab] = useState<'color' | 'scene'>('color');
  
  // Logo State
  const [logoState, setLogoState] = useState<LogoState>({
    file: null,
    previewUrl: null,
    x: 50, // Percentage 0-100
    y: 50, // Percentage 0-100
    scale: 20, // Percentage of width
  });

  // Refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // --- Effects ---

  // Handle global mouse tracking for the brush cursor
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (mode === EditMode.REMOVE_OBJECT && brushCursorRef.current) {
        brushCursorRef.current.style.left = `${e.clientX}px`;
        brushCursorRef.current.style.top = `${e.clientY}px`;
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [mode]);

  // Sync mask canvas size with main canvas
  useEffect(() => {
    if (canvasRef.current && maskCanvasRef.current) {
        maskCanvasRef.current.width = canvasRef.current.width;
        maskCanvasRef.current.height = canvasRef.current.height;
    }
  }, [currentImageUrl]);

  // Main Image Drawing
  useEffect(() => {
    if (!currentImageUrl || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const baseImg = new Image();
    baseImg.src = currentImageUrl;
    baseImg.crossOrigin = "anonymous";

    baseImg.onload = () => {
      // Set canvas to match image dimensions
      canvas.width = baseImg.width;
      canvas.height = baseImg.height;
      
      // Also update mask canvas to match
      if (maskCanvasRef.current) {
        maskCanvasRef.current.width = baseImg.width;
        maskCanvasRef.current.height = baseImg.height;
      }

      // Draw base image
      ctx.drawImage(baseImg, 0, 0);

      // Draw logo if exists
      if (logoState.previewUrl) {
        const logoImg = new Image();
        logoImg.src = logoState.previewUrl;
        logoImg.crossOrigin = "anonymous";
        
        logoImg.onload = () => {
          // Calculate logo size based on scale percentage of base image width
          const logoWidth = (baseImg.width * logoState.scale) / 100;
          const aspectRatio = logoImg.width / logoImg.height;
          const logoHeight = logoWidth / aspectRatio;

          // Calculate position based on percentages
          const xPos = (baseImg.width * logoState.x) / 100 - (logoWidth / 2);
          const yPos = (baseImg.height * logoState.y) / 100 - (logoHeight / 2);

          ctx.drawImage(logoImg, xPos, yPos, logoWidth, logoHeight);
        };
      }
    };
  }, [currentImageUrl, logoState]);

  // --- Handlers ---

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setOriginalImage(file);
      const url = URL.createObjectURL(file);
      setCurrentImageUrl(url);
      
      // Reset states
      setMode(EditMode.IDLE);
      setPromptInput('');
      setLogoState({ file: null, previewUrl: null, x: 50, y: 50, scale: 20 });
      clearMask();
    }
  };

  const clearMask = () => {
    const maskCanvas = maskCanvasRef.current;
    if (maskCanvas) {
      const ctx = maskCanvas.getContext('2d');
      ctx?.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
      setHasMask(false);
      maskHistoryRef.current = [];
    }
  };

  const undoMask = () => {
    const maskCanvas = maskCanvasRef.current;
    if (!maskCanvas || maskHistoryRef.current.length === 0) return;

    const ctx = maskCanvas.getContext('2d');
    if (ctx) {
       // Remove the latest state we just undid to
       maskHistoryRef.current.pop();
       
       if (maskHistoryRef.current.length > 0) {
         // Restore the previous state
         const previousState = maskHistoryRef.current[maskHistoryRef.current.length - 1];
         ctx.putImageData(previousState, 0, 0);
         setHasMask(true);
       } else {
         // If empty, clear it
         ctx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
         setHasMask(false);
       }
    }
  };

  const saveMaskState = () => {
    const maskCanvas = maskCanvasRef.current;
    if (maskCanvas) {
      const ctx = maskCanvas.getContext('2d');
      if (ctx) {
        const imageData = ctx.getImageData(0, 0, maskCanvas.width, maskCanvas.height);
        maskHistoryRef.current.push(imageData);
        // Limit history to 10 steps to save memory
        if (maskHistoryRef.current.length > 10) {
          maskHistoryRef.current.shift();
        }
      }
    }
  };

  const handleGeminiEdit = async () => {
    if (!currentImageUrl) return;
    
    // For mask mode, we don't strictly need text input if they drew a mask
    if (mode === EditMode.REMOVE_OBJECT && !hasMask) {
      alert("Please draw over the area you want to remove first.");
      return;
    }
    // For background mode, we need a prompt or a color
    if (mode === EditMode.CHANGE_BACKGROUND && !promptInput.trim()) {
      alert("Please select a color or describe the background.");
      return;
    }

    setProcessing({ isProcessing: true, message: 'Gemini is working its magic...' });

    try {
      let base64Data = "";
      let mimeType = "image/png";
      let finalPrompt = promptInput;

      // Logic for Mask/Eraser Mode
      if (mode === EditMode.REMOVE_OBJECT && maskCanvasRef.current && canvasRef.current) {
        // We need to composite the image + the red mask into a single image to send to Gemini
        const compositeCanvas = document.createElement('canvas');
        compositeCanvas.width = canvasRef.current.width;
        compositeCanvas.height = canvasRef.current.height;
        const ctx = compositeCanvas.getContext('2d');
        
        if (ctx) {
          // Draw original
          ctx.drawImage(canvasRef.current, 0, 0);
          // Draw mask on top (ensure it's visible to the model)
          ctx.drawImage(maskCanvasRef.current, 0, 0);
          
          // Get base64 of the composited image
          const dataUrl = compositeCanvas.toDataURL('image/png');
          base64Data = dataUrl.split(',')[1];
          
          // Improved Prompt for better inpainting
          finalPrompt = `The image contains a red translucent mask. Your task is to perform high-quality inpainting: remove the object or watermark covered by the red mask and fill the area to seamlessly match the surrounding background pattern, texture, and lighting. Do not change any other part of the image. Return the result as a clean PNG image without the mask.`;
        }
      } else {
        // Standard Logic for other modes
        if (currentImageUrl.startsWith('data:')) {
           const parts = currentImageUrl.split(',');
           base64Data = parts[1];
           mimeType = parts[0].split(':')[1].split(';')[0];
        } else {
           const response = await fetch(currentImageUrl);
           const blob = await response.blob();
           base64Data = await fileToGenerativePart(blob);
           mimeType = blob.type;
        }

        if (mode === EditMode.CHANGE_BACKGROUND) {
          finalPrompt = `Change the background of this image to: ${promptInput}. Strictly preserve the main foreground subject with pixel-perfect precision. Replace the entire background environment. Ensure realistic lighting and shadows on the subject to match the new background. Return as a PNG.`;
        }

        if (mode === EditMode.MAKE_HD) {
          finalPrompt = `Enhance this image to high definition. Sharpen details, improve clarity, reduce noise, and fix compression artifacts while maintaining the original content, color, and composition exactly. Return as a high-quality PNG.`;
        }
      }

      const newImageBase64 = await editImageWithGemini(base64Data, mimeType, finalPrompt);
      setCurrentImageUrl(newImageBase64);
      
      // Cleanup after success
      if (mode === EditMode.REMOVE_OBJECT) {
        clearMask();
      }
      setMode(EditMode.IDLE);
      setPromptInput('');

    } catch (error) {
      alert(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setProcessing({ isProcessing: false, message: '' });
    }
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const url = URL.createObjectURL(file);
      setLogoState(prev => ({ ...prev, file, previewUrl: url }));
    }
  };

  // --- Canvas Drawing Logic (Mask) ---
  
  const getCanvasCoordinates = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = maskCanvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    let clientX, clientY;
    if ('touches' in e) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
    } else {
        clientX = (e as React.MouseEvent).clientX;
        clientY = (e as React.MouseEvent).clientY;
    }

    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY
    };
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (mode !== EditMode.REMOVE_OBJECT) return;
    
    saveMaskState(); // Save state before new stroke
    
    setIsDrawing(true);
    const { x, y } = getCanvasCoordinates(e);
    const ctx = maskCanvasRef.current?.getContext('2d');
    if (ctx) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      // UPDATED: More transparent red (opacity 0.4)
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.4)'; 
      ctx.lineWidth = brushSize;
    }
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing || mode !== EditMode.REMOVE_OBJECT) return;
    e.preventDefault(); // Prevent scrolling on touch
    const { x, y } = getCanvasCoordinates(e);
    const ctx = maskCanvasRef.current?.getContext('2d');
    if (ctx) {
      ctx.lineTo(x, y);
      ctx.stroke();
      setHasMask(true);
    }
  };

  const stopDrawing = () => {
    if (isDrawing) {
        setIsDrawing(false);
        const ctx = maskCanvasRef.current?.getContext('2d');
        if (ctx) {
            ctx.closePath();
        }
    }
  };

  const downloadImage = () => {
    if (!canvasRef.current) return;
    const link = document.createElement('a');
    link.download = 'gemini-studio-edit.png';
    link.href = canvasRef.current.toDataURL('image/png'); // Force PNG
    link.click();
  };

  const resetImage = () => {
      if(originalImage) {
          const url = URL.createObjectURL(originalImage);
          setCurrentImageUrl(url);
          setLogoState(prev => ({...prev, previewUrl: null}));
          setMode(EditMode.IDLE);
          clearMask();
      }
  };

  // --- UI Components ---

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-slate-900 text-slate-100 font-sans">
      
      {/* Sidebar Controls */}
      <aside className="w-full md:w-80 bg-slate-800 border-r border-slate-700 flex flex-col p-6 z-20 shrink-0 shadow-xl h-screen md:h-auto overflow-hidden">
        <header className="mb-6 shrink-0">
          <div className="flex items-center gap-2 mb-2">
            <span className="p-2 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg shadow-lg shadow-blue-500/20">
              <Icons.Wand />
            </span>
            <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-400">
              Gemini Studio
            </h1>
          </div>
        </header>

        {/* Tools */}
        <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-6">
          
          {/* 1. Upload Section */}
          <div className="space-y-3">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Project</label>
            <label className="flex items-center justify-center w-full h-12 border border-dashed border-slate-600 rounded-lg hover:border-blue-500 hover:bg-slate-700/50 cursor-pointer transition-all group bg-slate-800/50">
              <div className="flex items-center gap-2 text-slate-400 group-hover:text-blue-400">
                <Icons.Upload />
                <span className="text-sm font-medium">New Image</span>
              </div>
              <input type="file" className="hidden" accept="image/png, image/jpeg" onChange={handleImageUpload} />
            </label>
          </div>

          {currentImageUrl && (
            <>
              {/* 2. Tools Navigation */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Tools</label>
                
                {/* Remove Object */}
                <button
                  onClick={() => { setMode(EditMode.REMOVE_OBJECT); setPromptInput(''); }}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all border ${
                    mode === EditMode.REMOVE_OBJECT 
                      ? 'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-900/50' 
                      : 'bg-slate-700/30 border-slate-700 hover:bg-slate-700 text-slate-300'
                  }`}
                >
                  <Icons.Eraser />
                  <div className="text-left">
                    <div className="font-medium text-sm">Magic Eraser</div>
                    <div className="text-[10px] opacity-70">Remove objects & watermarks</div>
                  </div>
                </button>

                {/* Background */}
                <button
                  onClick={() => { setMode(EditMode.CHANGE_BACKGROUND); setPromptInput(''); }}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all border ${
                    mode === EditMode.CHANGE_BACKGROUND
                      ? 'bg-purple-600 border-purple-500 text-white shadow-lg shadow-purple-900/50'
                      : 'bg-slate-700/30 border-slate-700 hover:bg-slate-700 text-slate-300'
                  }`}
                >
                  <Icons.Palette />
                  <div className="text-left">
                    <div className="font-medium text-sm">Background AI</div>
                    <div className="text-[10px] opacity-70">Replace background scenes</div>
                  </div>
                </button>
                
                {/* HD Enhance */}
                <button
                  onClick={() => { setMode(EditMode.MAKE_HD); setPromptInput(''); }}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all border ${
                    mode === EditMode.MAKE_HD
                      ? 'bg-amber-600 border-amber-500 text-white shadow-lg shadow-amber-900/50'
                      : 'bg-slate-700/30 border-slate-700 hover:bg-slate-700 text-slate-300'
                  }`}
                >
                  <Icons.Sparkles />
                  <div className="text-left">
                    <div className="font-medium text-sm">HD Enhance</div>
                    <div className="text-[10px] opacity-70">Sharpen & upscale quality</div>
                  </div>
                </button>

                {/* Branding */}
                <button
                  onClick={() => setMode(EditMode.ADD_LOGO)}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all border ${
                    mode === EditMode.ADD_LOGO
                      ? 'bg-emerald-600 border-emerald-500 text-white shadow-lg shadow-emerald-900/50'
                      : 'bg-slate-700/30 border-slate-700 hover:bg-slate-700 text-slate-300'
                  }`}
                >
                  <Icons.Stamp />
                  <div className="text-left">
                    <div className="font-medium text-sm">Add Logo</div>
                    <div className="text-[10px] opacity-70">Overlay watermark</div>
                  </div>
                </button>
              </div>

              {/* 3. Active Tool Properties */}
              {mode !== EditMode.IDLE && (
                <div className="p-4 bg-slate-900/60 rounded-xl border border-slate-700/60 backdrop-blur-sm animate-fade-in">
                  
                   {/* --- ERASER SETTINGS --- */}
                   {mode === EditMode.REMOVE_OBJECT && (
                     <div className="space-y-4">
                       <div className="flex justify-between items-center text-xs text-blue-400 font-bold uppercase mb-2">
                          <span>Brush Settings</span>
                       </div>
                       
                       <div className="space-y-2">
                         <div className="flex justify-between text-xs text-slate-400">
                           <span>Size</span>
                           <span>{brushSize}px</span>
                         </div>
                         <input 
                           type="range" min="10" max="100" 
                           value={brushSize}
                           onChange={(e) => setBrushSize(Number(e.target.value))}
                           className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                         />
                       </div>

                       <div className="grid grid-cols-2 gap-2">
                         <button 
                           onClick={undoMask} 
                           disabled={maskHistoryRef.current.length === 0}
                           className="flex items-center justify-center gap-2 py-2 text-xs bg-slate-700 hover:bg-slate-600 rounded text-slate-300 transition-colors disabled:opacity-50"
                         >
                           <Icons.Undo /> Undo
                         </button>
                         <button 
                           onClick={clearMask} 
                           className="flex items-center justify-center gap-2 py-2 text-xs bg-slate-700 hover:bg-slate-600 rounded text-slate-300 transition-colors"
                         >
                           <Icons.Trash /> Clear
                         </button>
                       </div>

                       <div className="border-t border-slate-700 pt-3">
                         <button 
                           onClick={handleGeminiEdit}
                           disabled={!hasMask || processing.isProcessing}
                           className="w-full py-2.5 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white rounded-lg font-bold text-sm shadow-lg shadow-blue-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                         >
                           {processing.isProcessing ? 'Processing...' : 'Apply Magic Eraser'}
                         </button>
                       </div>
                     </div>
                   )}

                   {/* --- BACKGROUND SETTINGS --- */}
                   {mode === EditMode.CHANGE_BACKGROUND && (
                     <div className="space-y-4">
                       {/* Tabs */}
                       <div className="flex bg-slate-800 p-1 rounded-lg">
                         <button 
                           onClick={() => setBgTab('color')}
                           className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${bgTab === 'color' ? 'bg-slate-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
                         >
                           Colors
                         </button>
                         <button 
                           onClick={() => setBgTab('scene')}
                           className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${bgTab === 'scene' ? 'bg-slate-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
                         >
                           Scenes
                         </button>
                       </div>

                       {bgTab === 'color' ? (
                         <div className="space-y-3">
                            <div className="grid grid-cols-5 gap-2">
                              {PRESET_COLORS.map(c => (
                                <button
                                  key={c.name}
                                  onClick={() => setPromptInput(`solid ${c.name} color`)}
                                  className={`w-full aspect-square rounded-full border border-slate-600 hover:scale-110 transition-transform focus:ring-2 focus:ring-purple-400 ring-offset-2 ring-offset-slate-900 ${promptInput.includes(c.name) ? 'ring-2 ring-purple-400' : ''}`}
                                  style={{ backgroundColor: c.hex }}
                                  title={c.name}
                                />
                              ))}
                              {/* Custom Color Picker Button */}
                              <div className="relative w-full aspect-square rounded-full border border-slate-600 flex items-center justify-center hover:bg-slate-700 bg-slate-800 text-slate-400 group overflow-hidden">
                                <Icons.Plus />
                                <input 
                                   type="color" 
                                   className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                                   onChange={(e) => setPromptInput(`solid color ${e.target.value}`)}
                                />
                              </div>
                            </div>
                            <p className="text-[10px] text-slate-400 text-center">Select or mix a color</p>
                         </div>
                       ) : (
                         <div className="space-y-2 max-h-48 overflow-y-auto pr-1 custom-scrollbar">
                            {SCENE_PRESETS.map((scene) => (
                              <button
                                key={scene.name}
                                onClick={() => setPromptInput(scene.prompt)}
                                className={`w-full text-left px-3 py-2 rounded-lg text-xs border transition-all ${
                                  promptInput === scene.prompt 
                                    ? 'bg-purple-600/20 border-purple-500 text-purple-200' 
                                    : 'bg-slate-800 border-slate-700 text-slate-300 hover:border-slate-500'
                                }`}
                              >
                                {scene.name}
                              </button>
                            ))}
                         </div>
                       )}

                       {/* Manual Prompt Override */}
                       <div className="pt-2 border-t border-slate-700">
                         <label className="text-[10px] text-slate-500 uppercase font-bold mb-1 block">Custom Prompt</label>
                         <input
                           type="text"
                           value={promptInput}
                           onChange={(e) => setPromptInput(e.target.value)}
                           placeholder="Describe desired background..."
                           className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-xs outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all placeholder:text-slate-600"
                         />
                       </div>

                       <button
                         onClick={handleGeminiEdit}
                         disabled={!promptInput.trim() || processing.isProcessing}
                         className="w-full py-2.5 bg-gradient-to-r from-purple-600 to-purple-500 hover:from-purple-500 hover:to-purple-400 text-white rounded-lg font-bold text-sm shadow-lg shadow-purple-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed mt-2"
                       >
                         {processing.isProcessing ? 'Generating...' : 'Generate Background'}
                       </button>
                     </div>
                   )}
                   
                   {/* --- HD ENHANCE SETTINGS --- */}
                   {mode === EditMode.MAKE_HD && (
                     <div className="space-y-4">
                       <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                         <div className="flex items-center gap-2 text-amber-400 font-medium text-xs mb-1">
                           <Icons.Sparkles /> <span>Enhancement Mode</span>
                         </div>
                         <p className="text-[11px] text-slate-400 leading-relaxed">
                           Gemini will re-process the image to sharpen edges, reduce noise, and improve clarity while keeping the original content.
                         </p>
                       </div>
                       
                       <button
                         onClick={handleGeminiEdit}
                         disabled={processing.isProcessing}
                         className="w-full py-2.5 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-white rounded-lg font-bold text-sm shadow-lg shadow-amber-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                       >
                         {processing.isProcessing ? 'Enhancing...' : 'Make High Definition'}
                       </button>
                     </div>
                   )}

                   {/* --- LOGO SETTINGS --- */}
                   {mode === EditMode.ADD_LOGO && (
                     <div className="space-y-4">
                       {!logoState.previewUrl ? (
                         <label className="block w-full text-center py-6 border-2 border-dashed border-slate-600 rounded-lg cursor-pointer hover:border-emerald-500 bg-slate-800/50 hover:bg-slate-800 transition-colors">
                           <div className="text-emerald-500 mb-2 flex justify-center"><Icons.Upload /></div>
                           <span className="text-xs font-bold text-slate-300">Click to Upload PNG</span>
                           <input type="file" accept="image/png" className="hidden" onChange={handleLogoUpload} />
                         </label>
                       ) : (
                         <>
                           <div className="space-y-3">
                             <div>
                               <label className="text-xs text-slate-400 flex justify-between mb-1">
                                 <span>Size</span> <span>{logoState.scale}%</span>
                               </label>
                               <input 
                                  type="range" min="5" max="80" 
                                  value={logoState.scale} 
                                  onChange={(e) => setLogoState(p => ({...p, scale: Number(e.target.value)}))}
                                  className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                               />
                             </div>
                             <div>
                               <label className="text-xs text-slate-400 flex justify-between mb-1">
                                 <span>X Position</span> <span>{logoState.x}%</span>
                               </label>
                               <input 
                                  type="range" min="0" max="100" 
                                  value={logoState.x} 
                                  onChange={(e) => setLogoState(p => ({...p, x: Number(e.target.value)}))}
                                  className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                               />
                             </div>
                             <div>
                               <label className="text-xs text-slate-400 flex justify-between mb-1">
                                 <span>Y Position</span> <span>{logoState.y}%</span>
                               </label>
                               <input 
                                  type="range" min="0" max="100" 
                                  value={logoState.y} 
                                  onChange={(e) => setLogoState(p => ({...p, y: Number(e.target.value)}))}
                                  className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                               />
                             </div>
                           </div>
                           <button 
                              onClick={() => setLogoState(p => ({...p, previewUrl: null}))}
                              className="w-full py-2 border border-red-500/30 text-red-400 rounded-lg text-xs hover:bg-red-500/10 transition-colors"
                           >
                              Remove Logo
                           </button>
                         </>
                       )}
                     </div>
                   )}
                </div>
              )}
            </>
          )}
        </div>
        
        {/* Footer Actions */}
        {currentImageUrl && (
          <div className="pt-4 mt-4 border-t border-slate-700 shrink-0">
             <div className="flex gap-2">
                <button 
                  onClick={resetImage} 
                  className="flex-1 py-2 flex items-center justify-center gap-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-xs font-medium transition-colors"
                >
                  <Icons.Refresh /> Reset
                </button>
                <button 
                  onClick={downloadImage}
                  className="flex-[2] py-2 flex items-center justify-center gap-2 bg-white text-slate-900 hover:bg-slate-200 rounded-lg text-xs font-bold transition-colors shadow-lg shadow-white/10"
                >
                  <Icons.Download /> Download PNG
                </button>
             </div>
          </div>
        )}
      </aside>

      {/* Main Canvas Area */}
      <main className="flex-1 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] bg-slate-950 relative overflow-hidden flex items-center justify-center p-4 md:p-8">
        
        {processing.isProcessing && <LoadingOverlay message={processing.message} />}

        {!currentImageUrl ? (
          <div className="text-center max-w-md animate-fade-in-up">
            <div className="w-24 h-24 bg-gradient-to-tr from-slate-800 to-slate-700 rounded-3xl mx-auto mb-6 flex items-center justify-center text-slate-500 shadow-2xl border border-slate-700/50">
               <Icons.Image />
            </div>
            <h2 className="text-3xl font-bold text-white mb-4 tracking-tight">Image Studio AI</h2>
            <p className="text-slate-400 mb-8 leading-relaxed">
              Professional object removal, background replacement, and branding tools powered by Gemini 2.5.
            </p>
            <label className="inline-flex items-center gap-2 px-8 py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-full font-bold transition-all transform hover:scale-105 cursor-pointer shadow-xl shadow-blue-500/20 group">
              <Icons.Upload />
              <span>Start Editing</span>
              <input type="file" className="hidden" accept="image/png, image/jpeg" onChange={handleImageUpload} />
            </label>
          </div>
        ) : (
          <div 
            ref={containerRef} 
            className="relative shadow-2xl shadow-black rounded-lg overflow-hidden border border-slate-700/50 max-w-full max-h-full bg-[url('https://www.transparenttextures.com/patterns/checkerboard-cross.png')]"
            onMouseEnter={() => setIsHoveringCanvas(true)}
            onMouseLeave={() => setIsHoveringCanvas(false)}
          >
            {/* Base Canvas */}
            <canvas ref={canvasRef} className="max-w-full max-h-[85vh] object-contain block" />
            
            {/* Masking Canvas Overlay */}
            <canvas 
              ref={maskCanvasRef}
              className={`absolute inset-0 w-full h-full touch-none ${mode === EditMode.REMOVE_OBJECT ? 'cursor-none' : 'pointer-events-none'}`}
              onMouseDown={startDrawing}
              onMouseMove={draw}
              onMouseUp={stopDrawing}
              onMouseLeave={stopDrawing}
              onTouchStart={startDrawing}
              onTouchMove={draw}
              onTouchEnd={stopDrawing}
            />

            {/* Custom Brush Cursor */}
            {mode === EditMode.REMOVE_OBJECT && !processing.isProcessing && (
              <div 
                 ref={brushCursorRef}
                 className="fixed pointer-events-none rounded-full border border-white bg-red-500/40 z-[9999]"
                 style={{ 
                   width: brushSize, 
                   height: brushSize, 
                   transform: 'translate(-50%, -50%)',
                   display: isHoveringCanvas ? 'block' : 'none'
                 }}
              />
            )}
            
            {/* Logo Bounding Box UI */}
            {mode === EditMode.ADD_LOGO && logoState.previewUrl && (
               <div className="absolute inset-0 pointer-events-none border-2 border-emerald-500/50 z-10 bg-emerald-500/5">
                 <div className="absolute top-2 right-2 bg-emerald-500 text-black text-[10px] font-bold px-2 py-1 rounded">PREVIEW</div>
               </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
};

export default App;