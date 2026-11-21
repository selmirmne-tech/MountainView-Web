import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { jsPDF } from "jspdf";
import { Check, Copy, ExternalLink, Printer, QrCode, Share2 } from "lucide-react";
import { ROOT_RESTORAN } from "../firebase/nodes";
import "./QrMenu.css";

function restaurantDisplayName(rootName) {
  return String(rootName || "Restoran")
    .replace(/([a-zčćžšđ])([A-ZČĆŽŠĐ])/gu, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .split(/\s+/)
    .map((word, index) => index === 0 ? word : word.toLocaleLowerCase("bs"))
    .join(" ");
}

function safeFilePart(value) {
  return String(value || "Restoran").replace(/[^a-z0-9_-]/gi, "_");
}

export default function QrMenu() {
  const rootName = String(ROOT_RESTORAN || "Restoran").trim();
  const displayName = restaurantDisplayName(rootName);
  const menuUrl = useMemo(
    () => `https://meni.vasrestoran.com/${encodeURIComponent(rootName)}`,
    [rootName],
  );
  const [qrImage, setQrImage] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(menuUrl, {
      width: 900,
      margin: 2,
      errorCorrectionLevel: "H",
      color: { dark: "#101713", light: "#ffffff" },
    })
      .then((dataUrl) => {
        if (active) setQrImage(dataUrl);
      })
      .catch((error) => {
        console.error("QR code generation failed:", error);
        if (active) setStatus("QR kod trenutno nije moguće generisati.");
      });
    return () => {
      active = false;
    };
  }, [menuUrl]);

  const makePdf = () => {
    if (!qrImage) return null;

    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const center = pageWidth / 2;
    pdf.setTextColor(31, 68, 52);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(25);
    pdf.text(pdf.splitTextToSize(displayName, 160), center, 35, { align: "center" });
    pdf.setTextColor(65, 75, 68);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(15);
    pdf.text("Skenirajte za digitalni meni", center, 49, { align: "center" });
    pdf.addImage(qrImage, "PNG", center - 65, 62, 130, 130);
    pdf.setTextColor(38, 58, 47);
    pdf.setFontSize(14);
    pdf.text(pdf.splitTextToSize(menuUrl.replace(/^https:\/\//, ""), 175), center, 207, { align: "center" });
    pdf.setTextColor(105, 112, 106);
    pdf.setFontSize(10);
    pdf.text(menuUrl, center, 220, { align: "center", maxWidth: 175 });
    return pdf;
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(menuUrl);
      setStatus("Link menija je kopiran.");
    } catch {
      setStatus("Kopiranje nije podržano u ovom browseru.");
    }
  };

  const savePdf = () => {
    const pdf = makePdf();
    if (!pdf) return;
    pdf.save(`QR_Meni_${safeFilePart(rootName)}.pdf`);
  };

  const shareOrPrintPdf = async () => {
    const pdf = makePdf();
    if (!pdf) return;
    const fileName = `QR_Meni_${safeFilePart(rootName)}.pdf`;
    const blob = pdf.output("blob");
    const file = new File([blob], fileName, { type: "application/pdf" });

    if (navigator.canShare?.({ files: [file] }) && navigator.share) {
      try {
        await navigator.share({ title: `QR meni — ${displayName}`, files: [file] });
      } catch (error) {
        if (error.name !== "AbortError") setStatus("PDF nije moguće podijeliti iz ovog browsera.");
      }
      return;
    }

    const pdfUrl = URL.createObjectURL(blob);
    const pdfWindow = window.open(pdfUrl, "_blank");
    if (!pdfWindow) {
      pdf.save(fileName);
      setStatus("PDF je preuzet. Možete ga otvoriti i odštampati.");
    } else {
      pdfWindow.opener = null;
      setStatus("PDF je otvoren u novom tabu; odatle ga možete odštampati ili sačuvati.");
    }
    window.setTimeout(() => URL.revokeObjectURL(pdfUrl), 60_000);
  };

  return (
    <main className="qr-menu-page">
      <div className="qr-menu-shell">
        <header className="qr-menu-heading">
          <div className="qr-menu-kicker"><QrCode size={17} /> DIGITALNI MENI</div>
          <h1>{displayName}</h1>
          <p>Skenirajte i pogledajte meni ovog lokala.</p>
        </header>

        <section className="qr-menu-card" aria-label="QR meni restorana">
          <button
            className="qr-image-button"
            type="button"
            onClick={savePdf}
            disabled={!qrImage}
            aria-label="Dodirnite QR kod da sačuvate PDF"
          >
            {qrImage
              ? <img src={qrImage} alt={`QR kod menija za ${displayName}`} />
              : <span className="qr-loading">Pripremam QR kod…</span>}
          </button>
          <p className="qr-help">Dodirnite QR kod da sačuvate PDF za štampu.</p>

          <button className="qr-link-button" type="button" onClick={copyLink}>
            <span>{menuUrl.replace(/^https:\/\//, "")}</span>
            {status === "Link menija je kopiran." ? <Check size={19} /> : <Copy size={19} />}
          </button>
          <p className="qr-help qr-link-help">Dodirnite adresu iznad da je kopirate.</p>
          <p className="qr-status" aria-live="polite">{status}</p>

          <div className="qr-actions">
            <button className="qr-action-button primary" type="button" onClick={shareOrPrintPdf} disabled={!qrImage}>
              <Share2 size={18} /> Podijeli / štampaj PDF <Printer size={17} />
            </button>
            <p className="qr-help">Sačuvajte PDF za štampu ili ga podijelite gostima.</p>

            <a className="qr-action-button secondary" href={menuUrl} target="_blank" rel="noreferrer">
              <ExternalLink size={18} /> Pogledaj meni na webu
            </a>
            <p className="qr-help">Dodirnite da otvorite meni u browseru.</p>
          </div>
        </section>
      </div>
    </main>
  );
}
