import { readdir, readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { DOMParser } from "@xmldom/xmldom";
import { kml } from "@tmcw/togeojson";

const [inputArgument = "Dwellingup", outputArgument = "routes", ...extraArgs] =
  process.argv.slice(2);

if (extraArgs.length > 0) {
  console.error(
    "Usage: node scripts/convert-kml-to-geojson.js [input-folder] [output-folder]",
  );
  process.exitCode = 1;
} else {
  const inputDirectory = path.resolve(inputArgument);
  const outputDirectory = path.resolve(outputArgument);

  try {
    const files = (await readdir(inputDirectory))
      .filter((file) => path.extname(file).toLowerCase() === ".kml")
      .sort((a, b) => a.localeCompare(b));

    await mkdir(outputDirectory, { recursive: true });

    const converted = [];
    const skipped = [];

    for (const file of files) {
      try {
        const source = await readFile(path.join(inputDirectory, file), "utf8");
        const parseErrors = [];
        const document = new DOMParser({
          onError(level, message) {
            if (level !== "warning") parseErrors.push(message);
          },
        }).parseFromString(source, "application/xml");

        if (parseErrors.length > 0) {
          throw new Error(parseErrors.join("; "));
        }
        if (document.documentElement?.localName?.toLowerCase() !== "kml") {
          throw new Error("Document root is not a KML element.");
        }

        const geoJson = kml(document);
        if (geoJson.type !== "FeatureCollection" || !Array.isArray(geoJson.features)) {
          throw new Error("KML conversion did not produce a GeoJSON FeatureCollection.");
        }

        const outputFile = `${path.basename(file, path.extname(file))}.geojson`;
        await writeFile(
          path.join(outputDirectory, outputFile),
          `${JSON.stringify(geoJson, null, 2)}\n`,
          "utf8",
        );
        converted.push(outputFile);
      } catch (error) {
        skipped.push(file);
        console.error(`Skipped ${file}: ${error.message}`);
      }
    }

    console.log(`\nConversion summary: ${converted.length} converted, ${skipped.length} skipped.`);
    if (converted.length > 0) {
      console.log("Converted files:");
      for (const file of converted) console.log(`  ${file}`);
    }
    if (files.length === 0) {
      console.log(`No .kml files found in ${inputDirectory}.`);
    }
  } catch (error) {
    console.error(`Unable to process KML folder: ${error.message}`);
    process.exitCode = 1;
  }
}
