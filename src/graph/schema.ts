import type { Schema } from "./payload";

// Every kind of record and every link field in the API's responses, for the
// graph on the home page. The page styles itself from this, so a new kind or
// link field is one line here. test/graph.test.ts fails until it's added.
//
// Line families: appears (solid), setting (dotted), isa (double), inside
// (dashed), related (dash-dot), killed (heavy dashes). A new field joins a
// family, so the key stays short. Fields inside an object that isn't a link
// are named by their path, as in villain.death.killed_by. A roll-up field also lists records that link to something inside
// this one (a state's residents who live in its towns); those links are listed
// in the panel but not drawn.
export const schema: Schema = {
  // In the order the counts and endpoints are shown
  kinds: {
    book: { label: "Book", plural: "books", noun: "books", example: 19 },
    short: { label: "Short", plural: "shorts", noun: "short stories", example: 19 },
    // Every character, villains included. A villain's links use
    // /api/villain/:id, so it's drawn as a villain and the rest as characters.
    character: {
      label: "Character",
      plural: "characters",
      noun: "characters",
      filter: "other characters",
      example: 202,
      status: {
        field: "status",
        marks: {
          Alive: { mark: "\u2665\uFE0E", label: "alive" },
          Deceased: { mark: "\u2020", label: "deceased" },
        },
      },
      drawnAs: { field: "villain", kind: "villain" },
    },
    villain: {
      label: "Villain",
      plural: "villains",
      noun: "villains",
      example: 19,
      // The heart is followed by U+FE0E, which keeps it a text glyph rather
      // than an emoji on phones
      status: {
        field: "status",
        marks: {
          Alive: { mark: "\u2665\uFE0E", label: "alive" },
          Deceased: { mark: "\u2020", label: "deceased" },
        },
      },
    },
    place: { label: "Place", plural: "places", noun: "places", example: 76 },
    type: { label: "Type", plural: "types", noun: "villain types", example: 2 },
    collection: { label: "Collection", plural: "collections", noun: "collections", example: 1 },
    publication: { label: "Publication", plural: "publications", noun: "publications", example: 7 },
  },
  fields: {
    "book.characters": { family: "appears" },
    "book.villains": { family: "appears" },
    "book.protagonists": { family: "appears" },
    "book.places": { family: "setting" },
    "book.collection": { family: "related" },
    "short.publication": { family: "inside" },
    "short.collection": { family: "inside" },
    "short.characters": { family: "appears" },
    "short.villains": { family: "appears" },
    "short.protagonists": { family: "appears" },
    "short.places": { family: "setting" },
    // Where the character died, which is one of its books or shorts
    "character.death.work": { family: "appears" },
    "character.death.killed_by": { family: "killed" },
    "character.books": { family: "appears" },
    "character.shorts": { family: "appears" },
    "character.residence": { family: "setting" },
    "character.type": { family: "isa" },
    "character.kinds": { family: "isa" },
    "character.killed": { family: "killed" },
    "villain.death.work": { family: "appears" },
    "villain.death.killed_by": { family: "killed" },
    "villain.books": { family: "appears" },
    "villain.shorts": { family: "appears" },
    "villain.residence": { family: "setting" },
    "villain.type": { family: "isa" },
    "villain.kinds": { family: "isa" },
    "villain.killed": { family: "killed" },
    "place.parent": { family: "inside" },
    "place.places": { family: "inside" },
    "place.books": { family: "setting" },
    "place.shorts": { family: "setting" },
    "place.characters": { family: "setting", rollup: true },
    "place.villains": { family: "setting", rollup: true },
    "type.parent": { family: "inside" },
    "type.types": { family: "inside" },
    "type.characters": { family: "isa", rollup: true },
    "type.villains": { family: "isa", rollup: true },
    "collection.book": { family: "related" },
    "collection.shorts": { family: "inside" },
    "publication.shorts": { family: "inside" },
  },
};
