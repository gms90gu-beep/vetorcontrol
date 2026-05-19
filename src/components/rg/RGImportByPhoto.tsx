import { useState, useRef } from "react";
import { 
  Camera, 
  Upload, 
  X, 
  Check, 
  AlertCircle, 
  Loader2, 
  Edit3, 
  Trash2,
  Plus,
  Save,
  Image as ImageIcon
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle,
  DialogFooter
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface RGImportByPhotoProps {
  onImportComplete: (data: any) => void;
}

export function RGImportByPhoto({ onImportComplete }: RGImportByPhotoProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState<"upload" | "processing" | "review">("upload");
  const [isProcessing, setIsProcessing] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [extractedData, setExtractedData] = useState<any>(null);
  const [editedProperties, setEditedProperties] = useState<any[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetState = () => {
    setStep("upload");
    setIsProcessing(false);
    setPreviewImage(null);
    setExtractedData(null);
    setEditedProperties([]);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      setPreviewImage(event.target?.result as string);
    };
    reader.readAsDataURL(file);

    processImage(file);
  };

  const processImage = async (file: File) => {
    setIsProcessing(true);
    setStep("processing");

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      const fileExt = file.name.split('.').pop();
      const filePath = `${user.id}/${Date.now()}.${fileExt}`;

      const { error: uploadError, data } = await supabase.storage
        .from('rg-ocr')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('rg-ocr')
        .getPublicUrl(filePath);

      // Call Edge Function
      const { data: ocrResult, error: ocrError } = await supabase.functions.invoke('rg-ocr-process', {
        body: { image_url: publicUrl }
      });

      if (ocrError) throw ocrError;

      setExtractedData(ocrResult);
      setEditedProperties(ocrResult.properties || []);
      
      // Save import record
      await supabase.from("rg_uploads").insert({
        agent_id: user.id,
        image_url: publicUrl,
        extracted_data: ocrResult,
        status: 'processed'
      });

      setStep("review");
    } catch (error: any) {
      toast.error("Erro no processamento: " + error.message);
      setStep("upload");
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePropertyChange = (index: number, field: string, value: any) => {
    const newProps = [...editedProperties];
    newProps[index] = { ...newProps[index], [field]: value };
    // Clear error flag if number is changed
    if (field === 'number') {
      newProps[index].possible_error = false;
    }
    setEditedProperties(newProps);
  };

  const handleAddProperty = () => {
    setEditedProperties([
      ...editedProperties,
      { number: "", type: "residence", observations: "", sequence: editedProperties.length + 1 }
    ]);
  };

  const handleRemoveProperty = (index: number) => {
    setEditedProperties(editedProperties.filter((_, i) => i !== index));
  };

  const handleConfirmImport = async () => {
    try {
      toast.loading("Importando registros...");
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      // Prepare properties for batch insertion
      const propertiesToInsert = editedProperties.map(prop => ({
        number: String(prop.number || ""),
        complement: prop.complement || "",
        type: prop.type,
        street_name: extractedData?.street_name || "",
        neighborhood: extractedData?.neighborhood || "",
        block_number: String(extractedData?.block_number || ""),
        reference: prop.reference || "",
        container_count: prop.container_count || 0,
        observations: prop.observations || "",
        user_id: user.id,
        status: "active" as const
      }));

      const { error: insertError } = await supabase
        .from("properties")
        .insert(propertiesToInsert);

      if (insertError) throw insertError;

      const finalData = {
        block_number: extractedData.block_number,
        street_name: extractedData.street_name,
        properties: editedProperties
      };

      onImportComplete(finalData);
      
      setIsOpen(false);
      resetState();
      toast.dismiss();
      toast.success(`${editedProperties.length} imóveis importados com sucesso!`);
    } catch (error: any) {
      toast.dismiss();
      toast.error("Erro ao importar: " + error.message);
    }
  };

  return (
    <>
      <Button 
        variant="outline"
        className="h-14 px-6 rounded-2xl bg-white border-2 border-slate-100 shadow-xl hover:bg-slate-50 transition-all font-black text-[10px] uppercase tracking-widest gap-2 text-slate-900"
        onClick={() => setIsOpen(true)}
      >
        <Camera className="h-5 w-5 text-emerald-500" /> Importar por Foto
      </Button>

      <Dialog open={isOpen} onOpenChange={(open) => {
        if (!isProcessing) setIsOpen(open);
        if (!open) resetState();
      }}>
        <DialogContent className={cn(
          "rounded-[2.5rem] border-none shadow-2xl overflow-hidden p-0 transition-all duration-500",
          step === "review" ? "sm:max-w-[900px]" : "sm:max-w-[450px]"
        )}>
          <div className="bg-slate-900 p-8 text-white relative">
            <div className="absolute top-0 right-0 p-8 opacity-10">
              <Camera className="h-24 w-24" />
            </div>
            <DialogHeader>
              <DialogTitle className="text-2xl font-black tracking-tighter">
                {step === "upload" && "Importar RG"}
                {step === "processing" && "Lendo Boletim..."}
                {step === "review" && "Conferir Dados"}
              </DialogTitle>
              <p className="text-slate-400 text-sm font-bold">
                {step === "upload" && "Tire uma foto do boletim físico"}
                {step === "processing" && "Nossa IA está identificando os imóveis"}
                {step === "review" && "Valide as informações extraídas"}
              </p>
            </DialogHeader>
          </div>

          <div className="p-8">
            {step === "upload" && (
              <div className="flex flex-col gap-6">
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className="group relative h-64 w-full rounded-[2rem] border-4 border-dashed border-slate-100 bg-slate-50 flex flex-col items-center justify-center gap-4 cursor-pointer hover:border-emerald-500/50 hover:bg-emerald-50/30 transition-all overflow-hidden"
                >
                  <div className="h-20 w-20 rounded-full bg-white shadow-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Camera className="h-10 w-10 text-emerald-500" />
                  </div>
                  <div className="text-center">
                    <p className="font-black text-slate-900">Clique para fotografar</p>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">ou arraste o arquivo aqui</p>
                  </div>
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    onChange={handleFileSelect} 
                    accept="image/*" 
                    capture="environment"
                    className="hidden" 
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <Button 
                    variant="outline" 
                    className="h-14 rounded-2xl font-black text-[10px] uppercase tracking-widest gap-2"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="h-4 w-4" /> Galeria
                  </Button>
                  <Button 
                    variant="outline" 
                    className="h-14 rounded-2xl font-black text-[10px] uppercase tracking-widest gap-2"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <ImageIcon className="h-4 w-4" /> Últimas
                  </Button>
                </div>
              </div>
            )}

            {step === "processing" && (
              <div className="flex flex-col items-center justify-center py-12 gap-6 text-center">
                <div className="relative h-32 w-32">
                  <div className="absolute inset-0 border-4 border-emerald-500/20 rounded-full"></div>
                  <div className="absolute inset-0 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Loader2 className="h-12 w-12 text-emerald-500 animate-pulse" />
                  </div>
                </div>
                <div>
                  <h4 className="text-xl font-black tracking-tight text-slate-900 mb-2">Processando Imagem</h4>
                  <p className="text-sm font-bold text-slate-400 max-w-[200px]">Isso pode levar alguns segundos dependendo da conexão.</p>
                </div>
              </div>
            )}

            {step === "review" && (
              <div className="flex flex-col gap-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Bairro</Label>
                    <Input 
                      value={extractedData?.neighborhood} 
                      onChange={(e) => setExtractedData({...extractedData, neighborhood: e.target.value})}
                      className="h-12 rounded-xl font-bold border-slate-100"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Quarteirão</Label>
                    <Input 
                      value={extractedData?.block_number} 
                      onChange={(e) => setExtractedData({...extractedData, block_number: e.target.value})}
                      className="h-12 rounded-xl font-bold border-slate-100"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Rua/Logradouro</Label>
                    <Input 
                      value={extractedData?.street_name} 
                      onChange={(e) => setExtractedData({...extractedData, street_name: e.target.value})}
                      className="h-12 rounded-xl font-bold border-slate-100"
                    />
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-100 overflow-hidden">
                  <ScrollArea className="h-[400px]">
                    <Table>
                      <TableHeader className="bg-slate-50">
                        <TableRow>
                          <TableHead className="font-black text-[10px] uppercase tracking-widest w-[80px]">Nº</TableHead>
                          <TableHead className="font-black text-[10px] uppercase tracking-widest">Tipo</TableHead>
                          <TableHead className="font-black text-[10px] uppercase tracking-widest">Obs</TableHead>
                          <TableHead className="w-[60px]"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {editedProperties.map((prop, index) => (
                          <TableRow key={index} className={cn(prop.possible_error && "bg-amber-50/50")}>
                            <TableCell className="p-2">
                              <div className="relative">
                                <Input 
                                  value={prop.number}
                                  onChange={(e) => handlePropertyChange(index, "number", e.target.value)}
                                  className={cn(
                                    "h-10 rounded-lg font-bold border-slate-100",
                                    prop.possible_error && "border-amber-400 focus-visible:ring-amber-400"
                                  )}
                                />
                                {prop.possible_error && (
                                  <div className="absolute -top-1 -right-1">
                                    <Badge className="h-5 w-5 p-0 flex items-center justify-center bg-amber-500 rounded-full border-2 border-white">
                                      <AlertCircle className="h-3 w-3" />
                                    </Badge>
                                  </div>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="p-2">
                              <Select 
                                value={prop.type} 
                                onValueChange={(v) => handlePropertyChange(index, "type", v)}
                              >
                                <SelectTrigger className="h-10 rounded-lg font-bold border-slate-100">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="rounded-xl border-none shadow-2xl">
                                  <SelectItem value="residence" className="font-bold">Residência</SelectItem>
                                  <SelectItem value="commerce" className="font-bold">Comércio</SelectItem>
                                  <SelectItem value="vacant_lot" className="font-bold">T. Baldio</SelectItem>
                                  <SelectItem value="strategic_point" className="font-bold">P. Estratégico</SelectItem>
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell className="p-2">
                              <Input 
                                value={prop.observations}
                                onChange={(e) => handlePropertyChange(index, "observations", e.target.value)}
                                className="h-10 rounded-lg font-bold border-slate-100"
                              />
                            </TableCell>
                            <TableCell className="p-2">
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                onClick={() => handleRemoveProperty(index)}
                                className="text-slate-400 hover:text-red-500 hover:bg-red-50"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                </div>

                <div className="flex justify-between items-center">
                  <Button 
                    variant="outline" 
                    className="rounded-xl font-black text-[10px] uppercase tracking-widest gap-2 h-12"
                    onClick={handleAddProperty}
                  >
                    <Plus className="h-4 w-4 text-emerald-500" /> Adicionar Imóvel
                  </Button>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    {editedProperties.length} imóveis detectados
                  </p>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="p-8 pt-0 flex-col sm:flex-row gap-3">
            {step === "review" ? (
              <>
                <Button 
                  variant="outline"
                  className="h-14 px-8 rounded-2xl font-black text-[10px] uppercase tracking-widest flex-1"
                  onClick={() => setStep("upload")}
                >
                  <ImageIcon className="h-4 w-4 mr-2" /> Refazer Foto
                </Button>
                <Button 
                  className="h-14 px-8 rounded-2xl bg-emerald-600 hover:bg-emerald-700 shadow-xl shadow-emerald-500/20 font-black text-[10px] uppercase tracking-widest gap-2 flex-1"
                  onClick={handleConfirmImport}
                >
                  <Save className="h-5 w-5" /> Confirmar Importação
                </Button>
              </>
            ) : (
              <Button 
                variant="ghost" 
                className="w-full font-bold text-slate-400"
                onClick={() => setIsOpen(false)}
                disabled={isProcessing}
              >
                Cancelar
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
