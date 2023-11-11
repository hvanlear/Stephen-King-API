const axios = require("axios");
// const $ = require("cheerio");
const cheerio = require("cheerio");
const fs = require("fs");
const vParse = require("./vParse");
const villainLinks = "https://stephenking.fandom.com/wiki/Category:Villains";
const baseUrl = "https://stephenking.fandom.com";

//this accepts a url and scrapes that page for elements with the class of category-page__member-link
// it loops through those elements and pushes the href attribuite to the bookLinks array and returns it

//TODO refactor the function to accept an additional parameter specifying what element to search for ie the categor-page_member-link

// const getBooks = async (url) => {
//   const bookLinks = [];
//   try {
//     const res = await axios.get(url);
//     const htmlParse = $(".category-page__member-link", res.data);
//     const totalLinks = htmlParse.length;

//     for (let i = 0; i < totalLinks; i++) {
//       bookLinks.push(htmlParse[i].attribs.href);
//     }
//     return bookLinks;
//   } catch (err) {
//     console.log(err);
//   }
// };
const getVillains = async (url) => {
  const villainLinks = [];
  try {
    const { data } = await axios.get(url);
    const $ = cheerio.load(data);
    $(".category-page__member-link").each((i, link) => {
      const href = link.attribs.href;
      villainLinks.push(href);
    });
    return villainLinks;
  } catch (err) {
    console.log(err);
  }
};

const makeBooks = async (categoryUrl) => {
  const pathArr = await getVillains(categoryUrl);
  try {
    let res = await Promise.all(
      pathArr.map((link) => vParse(`${baseUrl}${link}`))
    );
    const villainJSON = JSON.stringify(res);
    fs.writeFile("Villain.json", villainJSON, function (err, result) {
      if (err) console.log("error", err);
    });
    // console.log(villainJSON);
  } catch (err) {
    console.log(err);
  }
};

makeBooks(villainLinks);
// getVillains(villainLinks);
