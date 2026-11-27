import {
  Book,
  Short,
  Character,
  Place,
  Type,
  Collection,
  Publication,
  Death,
  Killer,
  books,
  shorts,
  characters,
  places,
  types,
  collections,
  publications,
  characterIdsByBook,
  characterIdsByShort,
  bookIdsByCharacter,
  shortIdsByCharacter,
  placeIdsByParent,
  bookIdsByPlace,
  shortIdsByPlace,
  characterIdsByPlace,
  placeIdsByBook,
  placeIdsByShort,
  placeIdsByCharacter,
  typeIdsByParent,
  characterIdsByType,
  kindIdsByCharacter,
  shortIdsByCollection,
  collectionIdByShort,
  collectionIdByBook,
  bookIdByCollection,
  shortIdsByPublication,
  publicationIdByShort,
  deathWorkByCharacter,
  victimIdsByCharacter,
  isProtagonist,
} from "./catalog";
import config from "./config";

// Every link in the API is built in this file, from the one base URL
const URL = config.url;

const charactersById = new Map(characters.map((c) => [c.id, c]));
const booksById = new Map(books.map((b) => [b.id, b]));
const shortsById = new Map(shorts.map((s) => [s.id, s]));
const placeNames = new Map(places.map((p) => [p.id, p.name]));
const typeNames = new Map(types.map((t) => [t.id, t.name]));
const collectionNames = new Map(collections.map((c) => [c.id, c.name]));
const publicationNames = new Map(publications.map((p) => [p.id, p.name]));

// A villain is linked at /api/villain/:id, as it was before characters
// existed, and anyone else at /api/character/:id, so no link ever changes
const characterLink = (id: number) => {
  const character = charactersById.get(id);
  return { name: character?.name, url: `${URL}/api/${character?.villain ? "villain" : "character"}/${id}` };
};

const characterLinks = (ids: number[] = []) => ids.map(characterLink);

const isVillain = (id: number) => charactersById.get(id)?.villain === true;

// The villains among some characters, in the same order
const villainLinks = (ids: number[] = []) => characterLinks(ids.filter(isVillain));

// The characters in a book or short, each with its role there, which is null
// until it's recorded. Its protagonists are the ones whose role there is
// protagonist, so a hero who only turns up in another story isn't listed as
// that story's protagonist.
const cast = (ids: number[] = [], handle: string) => {
  const withRole = (id: number) => ({ ...characterLink(id), role: charactersById.get(id)!.appears_in[handle] });
  const all = ids.map(withRole);
  return {
    characters: all,
    villains: ids.filter(isVillain).map(withRole),
    protagonists: all.filter((link) => link.role === "protagonist"),
  };
};

const placeLinks = (ids: number[] = []) =>
  ids.map((id) => ({
    name: placeNames.get(id),
    url: `${URL}/api/place/${id}`,
  }));

const typeLinks = (ids: number[] = []) =>
  ids.map((id) => ({
    name: typeNames.get(id),
    url: `${URL}/api/type/${id}`,
  }));

// One link, or null where there isn't one, as for most books and uncollected shorts
const collectionLink = (id: number | undefined) =>
  id === undefined
    ? null
    : { name: collectionNames.get(id), url: `${URL}/api/collection/${id}` };

const publicationLink = (id: number | undefined) =>
  id === undefined
    ? null
    : { name: publicationNames.get(id), url: `${URL}/api/publication/${id}` };

// A work lists everyone in it, then its villains and protagonists among them
export const bookResponse = (book: Book) => ({
  ...book,
  ...cast(characterIdsByBook.get(book.id), book.handle),
  places: placeLinks(placeIdsByBook.get(book.id)),
  collection: collectionLink(collectionIdByBook.get(book.id)),
});

// publication and collection hold handles, which are served as links in the same place
export const shortResponse = (short: Short) => ({
  ...short,
  publication: publicationLink(publicationIdByShort.get(short.id)),
  collection: collectionLink(collectionIdByShort.get(short.id)),
  ...cast(characterIdsByShort.get(short.id), short.handle),
  places: placeLinks(placeIdsByShort.get(short.id)),
});

const bookLink = (id: number) => ({ title: booksById.get(id)?.Title, url: `${URL}/api/book/${id}` });
const bookLinks = (ids: number[] = []) => ids.map(bookLink);

const shortLink = (id: number) => ({ title: shortsById.get(id)?.title, url: `${URL}/api/short/${id}` });
const shortLinks = (ids: number[] = []) => ids.map(shortLink);

// A killer with no record yet has a name and a null url, which becomes a
// link once the record exists
const killerLink = (killer: Killer) =>
  "name" in killer ? { name: killer.name, url: null } : characterLink(killer.character);

// in holds a handle, which is served as a link to the work
const deathResponse = (characterId: number, death: Death | null) => {
  if (death === null) {
    return null;
  }
  const where = deathWorkByCharacter.get(characterId);
  return {
    cause: death.cause,
    work: where === undefined ? null : "book" in where ? bookLink(where.book) : shortLink(where.short),
    killed_by: death.killed_by.map(({ members, ...killer }) =>
      members === undefined ? killerLink(killer) : { ...killerLink(killer), members: members.map(killerLink) }
    ),
  };
};

// The same response for /api/character/:id and, for a villain,
// /api/villain/:id. appears_in, residence and kinds hold handles, which are
// served as links instead, and appears_in's roles ride on the book and short
// links. protagonist comes from the roles, after villain. death is served in
// place, with its handle and ids as links.
export const characterResponse = (record: Character) => {
  const { id, name, villain, appears_in, residence, kinds, ...character } = record;
  return {
    id,
    name,
    villain,
    protagonist: isProtagonist(record),
    ...character,
    death: deathResponse(id, character.death),
    books: (bookIdsByCharacter.get(id) ?? []).map((bookId) => ({
      ...bookLink(bookId),
      role: appears_in[booksById.get(bookId)!.handle],
    })),
    shorts: (shortIdsByCharacter.get(id) ?? []).map((shortId) => ({
      ...shortLink(shortId),
      role: appears_in[shortsById.get(shortId)!.handle],
    })),
    residence: placeLinks(placeIdsByCharacter.get(id)),
    type: typeLinks([character.types_id])[0],
    kinds: typeLinks(kindIdsByCharacter.get(id)),
    killed: characterLinks(victimIdsByCharacter.get(id)),
  };
};

// parentId and appears_in only exist to build the links, so they aren't returned
export const placeResponse = ({ parentId, appears_in, ...place }: Place) => ({
  ...place,
  parent: parentId === null ? null : placeLinks([parentId])[0],
  places: placeLinks(placeIdsByParent.get(place.id)),
  books: bookLinks(bookIdsByPlace.get(place.id)),
  shorts: shortLinks(shortIdsByPlace.get(place.id)),
  characters: characterLinks(characterIdsByPlace.get(place.id)),
  villains: villainLinks(characterIdsByPlace.get(place.id)),
});

// parentId only exists to build the parent link, so it isn't returned
export const typeResponse = ({ parentId, ...type }: Type) => ({
  ...type,
  parent: parentId === null ? null : typeLinks([parentId])[0],
  types: typeLinks(typeIdsByParent.get(type.id)),
  characters: characterLinks(characterIdsByType.get(type.id)),
  villains: villainLinks(characterIdsByType.get(type.id)),
});

// A collection that's also a catalog book links to it
export const collectionResponse = (collection: Collection) => {
  const bookId = bookIdByCollection.get(collection.id);
  return {
    ...collection,
    book: bookId === undefined ? null : bookLink(bookId),
    shorts: shortLinks(shortIdsByCollection.get(collection.id)),
  };
};

export const publicationResponse = (publication: Publication) => ({
  ...publication,
  shorts: shortLinks(shortIdsByPublication.get(publication.id)),
});
