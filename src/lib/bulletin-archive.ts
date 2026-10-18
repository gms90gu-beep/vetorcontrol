import type jsPDF from "jspdf";
import { supabase } from "@/integrations/supabase/client";

export type BulletinType = "daily" | "weekly";

export type BulletinForSignature = {
  pdf: jsPDF;
  fileName: string;
  reportType: BulletinType;
  periodStart: string;
  periodEnd: string;
  epiWeek?: number;
  epiYear?: number;
  cycleId?: string | null;
  sourceDailyRecordId?: string | null;
  agentName: string;
  registration: string;
  municipality: string;
};

export type SignedBulletinRow = {
  id: string;
  agent_profile_id: string;
  agent_name_snapshot: string;
  registration_snapshot: string | null;
  report_type: BulletinType;
  period_start: string;
  period_end: string;
  epi_week: number | null;
  epi_year: number | null;
  cycle_id: string;
  source_daily_record_id: string | null;
  file_name: string;
  storage_path: string;
  document_sha256: string;
  signed_at: string;
  uploaded_at: string;
  status: "ready";
};

export async function assertPdfBlob(blob: Blob) {
  if (blob.size < 5) throw new Error("O arquivo do boletim está vazio ou não é um PDF válido.");

  // PDF readers allow the header near the beginning of a file. jsPDF emits it
  // at byte zero; allow the standard first 1 KiB for compatible PDF producers.
  const header = new TextDecoder("ascii").decode(
    await blob.slice(0, Math.min(blob.size, 1024)).arrayBuffer(),
  );
  if (!/%PDF-\d\.\d/.test(header)) {
    throw new Error("O arquivo gerado não contém a assinatura de um PDF válido.");
  }
}

function formatSignatureDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "long",
    timeStyle: "medium",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
}

function appendSignaturePage(
  pdf: jsPDF,
  bulletin: BulletinForSignature,
  signerName: string,
  signedAt: string,
  archiveId: string,
) {
  pdf.addPage();
  const width = pdf.internal.pageSize.getWidth();
  let y = 30;

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(16);
  pdf.setTextColor(15, 23, 42);
  pdf.text("ASSINATURA ELETRÔNICA DO AGENTE", width / 2, y, { align: "center" });
  y += 18;

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(11);
  pdf.text("Declaro que revisei e confirmo as informações deste boletim.", 20, y);
  y += 17;

  pdf.setFont("helvetica", "bold");
  pdf.text("Agente", 20, y);
  pdf.setFont("helvetica", "normal");
  pdf.text(signerName, 53, y);
  y += 9;

  pdf.setFont("helvetica", "bold");
  pdf.text("Matrícula", 20, y);
  pdf.setFont("helvetica", "normal");
  pdf.text(bulletin.registration || "—", 53, y);
  y += 9;

  pdf.setFont("helvetica", "bold");
  pdf.text("Município", 20, y);
  pdf.setFont("helvetica", "normal");
  pdf.text(bulletin.municipality || "—", 53, y);
  y += 9;

  pdf.setFont("helvetica", "bold");
  pdf.text("Documento", 20, y);
  pdf.setFont("helvetica", "normal");
  pdf.text(bulletin.reportType === "daily" ? "Boletim diário" : "Boletim semanal", 53, y);
  y += 9;

  pdf.setFont("helvetica", "bold");
  pdf.text("Período", 20, y);
  pdf.setFont("helvetica", "normal");
  pdf.text(`${bulletin.periodStart} a ${bulletin.periodEnd}`, 53, y);
  y += 9;

  pdf.setFont("helvetica", "bold");
  pdf.text("Assinado em", 20, y);
  pdf.setFont("helvetica", "normal");
  pdf.text(`${formatSignatureDate(signedAt)} (horário de Brasília)`, 53, y);
  y += 14;

  pdf.setDrawColor(148, 163, 184);
  pdf.line(20, y, width - 20, y);
  y += 10;
  pdf.setFontSize(8);
  pdf.setTextColor(71, 85, 105);
  pdf.text("Assinatura registrada na conta autenticada do agente no VetorControl.", 20, y);
  y += 6;
  pdf.text(`Identificador de verificação: ${archiveId}`, 20, y);
  y += 6;
  pdf.text(
    "O arquivo é armazenado sem edição e possui resumo SHA-256 registrado no sistema.",
    20,
    y,
  );
}

async function sha256(blob: Blob): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new Error(
      "Este dispositivo não oferece verificação criptográfica segura. Abra o sistema em HTTPS e tente novamente.",
    );
  }
  const digest = await globalThis.crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function verifySignedBulletinHash(blob: Blob, expectedHash: string): Promise<void> {
  if (!/^[0-9a-f]{64}$/.test(expectedHash)) {
    throw new Error("O boletim tem um registro SHA-256 inválido. Avise o administrador.");
  }
  const actualHash = await sha256(blob);
  if (actualHash !== expectedHash) {
    throw new Error("O PDF baixado não corresponde ao resumo SHA-256 do arquivo.");
  }
}

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export async function signAndArchiveBulletin(
  bulletin: BulletinForSignature,
  typedName: string,
): Promise<SignedBulletinRow> {
  const cycleId = bulletin.cycleId?.trim();
  if (!cycleId) {
    throw new Error("Este boletim não está vinculado a um ciclo válido e não pode ser assinado.");
  }
  const normalizedName = typedName.trim().replace(/\s+/g, " ");
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) throw new Error("Sua sessão expirou. Entre novamente para assinar.");

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, full_name, registration_number, city")
    .eq("id", auth.user.id)
    .single();
  if (profileError || !profile?.full_name)
    throw new Error("Não foi possível confirmar seu perfil de agente.");
  if (normalizedName !== profile.full_name.trim().replace(/\s+/g, " ")) {
    throw new Error("Digite seu nome completo exatamente como aparece no cadastro.");
  }

  let id: string = globalThis.crypto.randomUUID();
  let storagePath = `${auth.user.id}/${id}.pdf`;
  let pending: { id: string; signed_at: string; storage_path: string } | null = null;
  const { data: created, error: createError } = await supabase
    .from("signed_bulletin_archive")
    .insert({
      id,
      agent_profile_id: auth.user.id,
      agent_name_snapshot: profile.full_name,
      registration_snapshot: bulletin.registration || profile.registration_number,
      report_type: bulletin.reportType,
      period_start: bulletin.periodStart,
      period_end: bulletin.periodEnd,
      epi_week: bulletin.epiWeek ?? null,
      epi_year: bulletin.epiYear ?? null,
      cycle_id: cycleId,
      source_daily_record_id: bulletin.sourceDailyRecordId ?? null,
      file_name: bulletin.fileName,
      storage_path: storagePath,
      signature_method: "authenticated_user_confirmation",
      status: "pending",
    })
    .select("id, signed_at")
    .single();
  if (!createError && created) {
    pending = { ...created, storage_path: storagePath };
  } else if (createError?.code === "23505") {
    let retryQuery = supabase
      .from("signed_bulletin_archive")
      .select("id, signed_at, storage_path")
      .eq("agent_profile_id", auth.user.id)
      .eq("report_type", bulletin.reportType)
      .eq("period_start", bulletin.periodStart)
      .eq("period_end", bulletin.periodEnd)
      .eq("status", "pending");
    retryQuery = retryQuery.eq("cycle_id", cycleId);
    const { data: retry } = await retryQuery.maybeSingle();
    if (retry) {
      pending = retry;
      id = retry.id;
      storagePath = retry.storage_path;
    } else {
      throw new Error(
        "Este período já tem um boletim assinado. Baixe a versão oficial no Arquivo de Boletins.",
      );
    }
  } else {
    throw createError || new Error("Não foi possível registrar a assinatura.");
  }

  const storage = supabase.storage.from("signed-bulletins");
  const priorFile = await storage.download(storagePath);
  let blob: Blob;
  if (priorFile.data) {
    blob = priorFile.data;
  } else {
    const storageError = priorFile.error as { statusCode?: string } | null;
    const notFound =
      priorFile.error &&
      /not found|404|object does not exist/i.test(
        `${priorFile.error.message} ${storageError?.statusCode || ""}`,
      );
    if (priorFile.error && !notFound) throw priorFile.error;
    appendSignaturePage(bulletin.pdf, bulletin, profile.full_name, pending!.signed_at, id);
    blob = bulletin.pdf.output("blob") as Blob;
    await assertPdfBlob(blob);
    const { error: uploadError } = await storage.upload(storagePath, blob, {
      contentType: "application/pdf",
      upsert: false,
    });
    if (uploadError)
      throw new Error(
        `A assinatura foi registrada, mas o PDF não foi arquivado: ${uploadError.message}`,
      );
    const { data: storedBlob, error: verifyError } = await storage.download(storagePath);
    if (verifyError || !storedBlob) {
      throw new Error(
        "O PDF foi enviado, mas não foi possível conferir o arquivo armazenado. Avise o administrador.",
      );
    }
    blob = storedBlob;
  }

  const checksum = await sha256(blob);

  const { data: ready, error: readyError } = await supabase
    .from("signed_bulletin_archive")
    .update({ status: "ready", document_sha256: checksum })
    .eq("id", id)
    .select("*")
    .single();
  if (readyError || !ready)
    throw new Error(
      "O PDF foi enviado, mas não foi possível concluir o arquivo. Avise o administrador antes de tentar assinar novamente.",
    );

  downloadBlob(blob, bulletin.fileName);
  return ready as SignedBulletinRow;
}

export function downloadSignedBulletin(blob: Blob, fileName: string) {
  downloadBlob(blob, fileName);
}
