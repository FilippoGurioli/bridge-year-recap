import { chromium } from "playwright";
import fs from "fs";
import { PDFDocument } from "pdf-lib";
import path from "path";

const year = process.argv[2];
const figbCode = process.argv[3];
if (!year || !figbCode) {
  console.error("Uso: node scraping.js <anno> <codice-figb>");
  process.exit(1);
}

const START_URL = `https://www.federbridge.it/Punti/frame.asp?Anno=${year}&Tipo=G&MmbCode=${figbCode}&MmbType=A&MmbBegYear=&FLTgare=&FLTtipo=&FLTpunti=0&FLTpartner=`;

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const pdfPaths = [];

  await page.goto(START_URL);

  // Trova tutti i link dei tornei nella tabella
  const links = await page.$$eval("a", as =>
    as
      .map(a => a.href)
      .filter(href => 
        href.includes("Classifica.asp") && 
        !href.includes("SimCode")) // filtra solo i link ai tornei
      .reverse()
  );

  console.log(`Trovati ${links.length} tornei.`);

  const outputDir = "pdf";
  // Crea cartella output
  if (!fs.existsSync("pdf")) fs.mkdirSync("pdf");

  for (const url of links) {
    console.log("Scarico:", url);

    await page.goto(url, { waitUntil: "networkidle" });

    const text = await page.$eval(".TitoloTorGareClass", el => el.innerText || "")
      .catch(() => "");

    if (text.includes("Grand Prix")) {
      console.log("Saltato (Grand Prix):", url);
      continue;
    }

    // Estrae i parametri dell'URL
    const u = new URL(url);
    const data = u.searchParams.get("data");
    const cod = u.searchParams.get("cod");

    // Converte la data da 31/12/2022 → 31-12-2022
    const safeDate = data.replace(/\//g, "-");
    const filename = `${safeDate}-${cod}.pdf`;

    const pdfPath =  path.join("pdf", filename);

    await page.pdf({
      path: `${outputDir}/${filename}`,
      format: "A4",
      printBackground: true
    });

    pdfPaths.push(pdfPath);
  }

  await browser.close();

  console.log("Unisco tutti i PDF in uno unico...");

  const mergedPdf = await PDFDocument.create();

  for (const pdfPath of pdfPaths) {
    const pdfBytes = fs.readFileSync(pdfPath);
    const pdf = await PDFDocument.load(pdfBytes);

    const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
    copiedPages.forEach(page => mergedPdf.addPage(page));
  }

  const mergedBytes = await mergedPdf.save();
  fs.writeFileSync(`Tornei_${year}-${figbCode}_unificato.pdf`, mergedBytes);

  console.log(`Creato: Tornei_${year}-${figbCode}_unificato.pdf`);
}

main();
