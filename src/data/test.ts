const fs = require('fs');

// Read the JSON file
const data = fs.readFileSync('VillainMaster.json', 'utf8');

// Parse the JSON data into a JavaScript object
const obj = JSON.parse(data);

// Rename 'data' key to 'notes' for each object
obj.forEach(item => {
  item.notes = item.data;
  delete item.data;
});

// Convert the JavaScript object into a string representation
const js = 'module.exports = ' + JSON.stringify(obj, null, 2);

// Write the string to a new JavaScript file
fs.writeFileSync('newData.js', js);