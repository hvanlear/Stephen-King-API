import type { Role } from "../catalog";
import type { FieldInfo, NoteInfo, Schema, StatusInfo } from "./payload";

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

// A character's mark for alive or deceased. The heart is followed by U+FE0E,
// which keeps it a text glyph rather than an emoji on phones.
const lifeStatus: StatusInfo = {
  field: "status",
  marks: {
    Alive: { mark: "\u2665\uFE0E", label: "alive" },
    Deceased: { mark: "\u2020", label: "deceased" },
  },
};

// A character's link fields. A villain's response is a character's, so it has
// them too.
const characterFields: Record<string, FieldInfo> = {
  // Where the character died, which is one of its books or shorts
  "death.work": { family: "appears" },
  "death.killed_by": { family: "killed" },
  books: { family: "appears" },
  shorts: { family: "appears" },
  residence: { family: "setting" },
  type: { family: "isa" },
  kinds: { family: "isa" },
  killed: { family: "killed" },
};

const fieldsOf = (kind: string, fields: Record<string, FieldInfo>) =>
  Object.fromEntries(Object.entries(fields).map(([field, info]) => [`${kind}.${field}`, info]));

// A character's role in a work, on the links between them. A ring shows a
// story's leads first, then its supporting cast, then anyone whose role isn't
// recorded, then cameos, whose lines are faint (Jack Torrance in Doctor Sleep).
const roles: Record<Role, NoteInfo> = {
  protagonist: { rank: 3 },
  antagonist: { rank: 3 },
  supporting: { rank: 2 },
  minor: { rank: 0, faint: true },
};

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
      status: lifeStatus,
      drawnAs: { field: "villain", kind: "villain" },
    },
    villain: { label: "Villain", plural: "villains", noun: "villains", example: 19, status: lifeStatus },
    place: { label: "Place", plural: "places", noun: "places", example: 76 },
    type: { label: "Type", plural: "types", noun: "character types", example: 2 },
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
    ...fieldsOf("character", characterFields),
    ...fieldsOf("villain", characterFields),
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
  notes: roles,
};
