const config = require("./config.json");
const { AIHorde } = require("@zeldafan0225/ai_horde");
const { setTimeout } = require("node:timers/promises");
const fs = require("fs");
const { baseRequest } = require("./baseRequest");

const promptSamples = {
  dragon: "a dragon",
  trump: "donald trump wearing a top hat",
  skyscraper: "people releasing Chinese lanterns into the sky from skyscrapers",
  Godzilla: "Godzilla",
  zodiac: "Chinese zodiac",
  cherrytree: "a blossoming cherry tree",
  catgirl: "a cute catgirl wearing a qipao",
  Pooh: "Xi Jinping cosplaying as Winnie the Pooh",
  garden: "a beautiful garden, cherry trees, lotus flowers, chrysanthemums",
  noodles: "a bowl of noodles"
};

const htmlfile = "cny.html"
const mdfile   = "cny.md"
const jsonfile = "cny.json"

var models = {};
var styles = {};

const css="td { vertical-align: middle; }\ntd { min-width: 128px; }";

const main = async () => {
  console.log(
    "Lo! I am the preview generator. On a mountain of skulls, in the castle of pain, I sat on a throne of blood!"
  );

  hordeAPIKey = config.ai_horde_api_key;
  if (hordeAPIKey == null) {
    console.error(
      "Horde API key is required to generate most of these previews."
    );
    return;
  }

  models = await getJSON(
    "stable_diffusion.json"
  );
  styles = await getJSON(
    "styles.json"
  );

  var generationStatus = {};

  for (const [styleName, styleContents] of Object.entries(styles)) {
    const safeStyleName = styleName.replace(/[^a-z0-9]/gi, "_").toLowerCase();
    generationStatus[styleName] = {};
    for (const [promptType, promptSample] of Object.entries(promptSamples)) {
      const success = await generateImageForStyleAndPrompt(
        safeStyleName,
        styleContents,
        promptType,
        promptSample
      );
      if (success) {
        generationStatus[styleName][promptType] = true;
      } else {
        generationStatus[styleName][promptType] = false;
      }
    }
  }

  // write previews.md and previews.json files
  generateFlatFiles(generationStatus);

  console.log("I am finished! I have come to wonder in this time:\n- How does the throne of blood support me?\n- How does a castle stay stable on a mountain of thrones?\n- How do you build a castle out of pain?");
};

function generateFlatFiles(generationStatus) {
  fs.writeFileSync(mdfile, "# Style Previews\n\n| style ");
  fs.writeFileSync(htmlfile, `<style>\n${css}\n</style>\n<h1>Style Previews</h1>\n<table>\n  <thead><tr>\n    <td>style</td>`);
  const previews = {};

  for (const promptType of Object.keys(promptSamples)) {
    fs.appendFileSync(mdfile, `| ${promptType} `);
    fs.appendFileSync(htmlfile, `\n    <td>${promptType}</td>`);
  }
  fs.appendFileSync(mdfile, "|\n");
  fs.appendFileSync(htmlfile, "\n  </tr></thead>\n  <tbody>");
  for (let i = 0; i < Object.keys(promptSamples).length + 1; i++) {
    fs.appendFileSync(mdfile, `| --- `);
  }
  fs.appendFileSync(mdfile, "|\n");

  for (const [styleName, promptStatus] of Object.entries(generationStatus)) {
    const safeStyleName = styleName.replace(/[^a-z0-9]/gi, "_").toLowerCase();
    previews[styleName] = {};

    fs.appendFileSync(mdfile, `| ${styleName} `);
    fs.appendFileSync(htmlfile, `\n    <tr>\n      <td>${styleName}</td>`);
    // create table heading for all the prompt types

    for (const [promptType, status] of Object.entries(promptStatus)) {
      if (status) {
        fs.appendFileSync(mdfile,`| ![${styleName} ${promptType} preview](/images/${safeStyleName}_${promptType}.webp?raw=true) `);
        fs.appendFileSync(htmlfile,`\n      <td><img src="${config.cdn_url_prefix}/${safeStyleName}_${promptType}.webp" alt="${styleName}"></td>`);
        previews[styleName][promptType] = `${config.cdn_url_prefix}/${safeStyleName}_${promptType}.webp`;
      } else {
        fs.appendFileSync(mdfile, `| ❌ `);
        fs.appendFileSync(htmlfile, `\n      <td>❌</td>`);
      }
    }
    fs.appendFileSync(mdfile, "|\n");
    fs.appendFileSync(htmlfile, "\n    </tr>");
  }
  fs.appendFileSync(htmlfile, "\n  </tbody>\n</table>");
  fs.writeFileSync(jsonfile, JSON.stringify(previews, null, 2));
}

async function generateImageForStyleAndPrompt(
  safeStyleName,
  styleContent,
  promptType,
  promptSample
) {
  // Check for model in model reference file
  if (!(styleContent.model in models)) {
    console.error("Invalid model: " + styleContent.model);
    return false;
  }

  const fileName = safeStyleName + "_" + promptType + ".webp";
  if (fs.existsSync("images/" + fileName)) {
    // Skipping generation because image exists
    return true;
  }

  const styleRequest = createRequestForStyleAndPrompt(
    styleContent,
    promptSample
  );

  const results = await generateImages(styleRequest);
  for (const result of results) {
    await saveResult(result, fileName);
    return true;
  }

  return false;
}

function createRequestForStyleAndPrompt(styleContent, prompt) {
  const model = models[styleContent.model];
  const modelBaseline = model.baseline;

  var styleRequest = structuredClone(baseRequest);
  if (styleContent.model != null) {
    styleRequest.models = [styleContent.model];
  }
  if (styleContent.steps != null) {
    styleRequest.params.steps = styleContent.steps;
  }
  if (styleContent.width != null) {
    styleRequest.params.width = styleContent.width;
  }
  if (styleContent.height != null) {
    styleRequest.params.height = styleContent.height;
  }
  if (styleContent.cfg_scale != null) {
    styleRequest.params.cfg_scale = styleContent.cfg_scale;
  }
  if (styleContent.sampler_name != null) {
    styleRequest.params.sampler_name = styleContent.sampler_name;
  }
  if (styleContent.loras != null) {
    styleRequest.params.loras = styleContent.loras;
  }
  if (styleContent.tis != null) {
    styleRequest.params.tis = styleContent.tis;
  }
  if (modelBaseline.includes("stable_diffusion_xl")) {
    styleRequest.params.hires_fix = false;
  }
  if (styleContent.prompt != null) {
    styleRequest.prompt = styleContent.prompt
      .replace("{p}", prompt)
      .replace("{np}", "");
  }
  return styleRequest;
}

async function saveResult(imageObject, fileName) {
  const imageResponse = await fetch(imageObject.url);
  const imageBuffer = await imageResponse.arrayBuffer();
  fs.writeFileSync("images/" + fileName, Buffer.from(imageBuffer));
}

async function generateImages(request) {
  const apiKey = config.ai_horde_api_key;
  const ai_horde = new AIHorde({
    client_agent: config.client_agent,
    default_token: apiKey,
  });

  // start the generation of an image with the given payload
  const generation = await ai_horde.postAsyncImageGenerate(request);
  console.log(
    "Generation Submitted, ID: " +
      generation.id +
      ", kudos cost: " +
      generation.kudos
  );

  while (true) {
    const check = await ai_horde.getImageGenerationCheck(generation.id);
    console.log(
      "Q#:" +
        check.queue_position +
        " W:" +
        check.waiting +
        " P:" +
        check.processing +
        " F:" +
        check.finished
    );
    if (check.done) {
      console.log("Generation complete.");
      break;
    }
    await setTimeout(3000);
  }

  const generationResult = await ai_horde.getImageGenerationStatus(
    generation.id
  );

  var results = [];
  for (const result of generationResult.generations) {
    if (result.censored) {
      console.error("Censored image detected! Image discarded...");
    } else {
      results.push({ id: result.id, url: result.img });
    }
  }

  return results;
}

async function getJSON(url) {
  try {
//    const response = await fetch(url);
//    return await response.json();
    return JSON.parse(fs.readFileSync(url));
  } catch (error) {
    console.log(error);
    return {};
  }
}

main();
