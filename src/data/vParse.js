const cheerio = require("cheerio");
const axios = require("axios");

//this scrapes a single page and returns an object with requested data
const villainParse = async (url) => {
  const villain = {};
  try {
    const { data } = await axios.get(url);
    const $ = cheerio.load(data);
    const categories = $("#articleCategories > div > ul > li");
    const catData = [];
    const name = $("#firstHeading").text();
    const types = [
      "Animals",
      "Demons",
      "Creatures",
      "Monsters",
      "Groups",
      "Vehicles",
    ];
    let flag = true;

    villain.name = name;
    categories.each((i, cat) => {
      cat = $(cat).text().replace(/\n/g, "").replace(/\t/g, "");
      if (cat === "Film only" || cat === "Film only characters") {
        //breaking out of the .each loop not working with return flase
        //set external flag instead
        flag = false;
      }
      if (cat === "Males" || cat === "Females") {
        villain.gender = cat;
      }
      if (cat === "Deceased") {
        villain.status = cat;
      }
      if (types.includes(cat)) villain.type = cat;
      if (!Object.values(villain).includes(cat)) {
        catData.push(cat);
      }
    });
    if (!("status" in villain)) villain.status = "Alive";
    if (!("type" in villain)) villain.type = "Humans";
    villain.appearsIn = [];
    villain.data = catData;

    if (!flag) return undefined;
    return villain;
  } catch (err) {
    console.log(err);
  }
};

// villainParse("https://stephenking.fandom.com/wiki/Bob_Anderson");
// villainParse("https://stephenking.fandom.com/wiki/Randall_Flagg");
// villainParse("https://stephenking.fandom.com/wiki/Kurt_Barlow");
//two film only Vs
// villainParse("https://stephenking.fandom.com/wiki/Mark_Bing");
// villainParse("https://stephenking.fandom.com/wiki/Micah");

module.exports = villainParse;
