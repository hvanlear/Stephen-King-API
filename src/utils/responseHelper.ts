import {
  Book,
  Short,
  Villain,
  Place,
  Type,
  Collection,
  Publication,
  books,
  shorts,
  villains,
  places,
  types,
  collections,
  publications,
  villainIdsByBook,
  villainIdsByShort,
  bookIdsByVillain,
  shortIdsByVillain,
  placeIdsByParent,
  bookIdsByPlace,
  shortIdsByPlace,
  villainIdsByPlace,
  placeIdsByBook,
  placeIdsByShort,
  placeIdsByVillain,
  typeIdsByParent,
  villainIdsByType,
  kindIdsByVillain,
  shortIdsByCollection,
  collectionIdByShort,
  collectionIdByBook,
  bookIdByCollection,
  shortIdsByPublication,
  publicationIdByShort,
} from "../catalog";
import config from "../config";

const URL = config.url;

const villainNames = new Map(villains.map((v) => [v.id, v.name]));
const bookTitles = new Map(books.map((b) => [b.id, b.Title]));
const shortTitles = new Map(shorts.map((s) => [s.id, s.title]));
const placeNames = new Map(places.map((p) => [p.id, p.name]));
const typeNames = new Map(types.map((t) => [t.id, t.name]));
const collectionNames = new Map(collections.map((c) => [c.id, c.name]));
const publicationNames = new Map(publications.map((p) => [p.id, p.name]));

const villainLinks = (ids: number[] = []) =>
  ids.map((id) => ({
    name: villainNames.get(id),
    url: `${URL}/api/villain/${id}`,
  }));

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

export const bookResponse = (book: Book) => ({
  ...book,
  villains: villainLinks(villainIdsByBook.get(book.id)),
  places: placeLinks(placeIdsByBook.get(book.id)),
  collection: collectionLink(collectionIdByBook.get(book.id)),
});

// publication and collection hold handles, which are served as links in the same place
export const shortResponse = (short: Short) => ({
  ...short,
  publication: publicationLink(publicationIdByShort.get(short.id)),
  collection: collectionLink(collectionIdByShort.get(short.id)),
  villains: villainLinks(villainIdsByShort.get(short.id)),
  places: placeLinks(placeIdsByShort.get(short.id)),
});

const bookLinks = (ids: number[] = []) =>
  ids.map((id) => ({
    title: bookTitles.get(id),
    url: `${URL}/api/book/${id}`,
  }));

const shortLinks = (ids: number[] = []) =>
  ids.map((id) => ({
    title: shortTitles.get(id),
    url: `${URL}/api/short/${id}`,
  }));

// appears_in, residence and kinds hold handles, which are served as links instead
export const villainResponse = ({ appears_in, residence, kinds, ...villain }: Villain) => ({
  ...villain,
  books: bookLinks(bookIdsByVillain.get(villain.id)),
  shorts: shortLinks(shortIdsByVillain.get(villain.id)),
  residence: placeLinks(placeIdsByVillain.get(villain.id)),
  type: typeLinks([villain.types_id])[0],
  kinds: typeLinks(kindIdsByVillain.get(villain.id)),
});

// parentId and appears_in only exist to build the links, so they aren't returned
export const placeResponse = ({ parentId, appears_in, ...place }: Place) => ({
  ...place,
  parent: parentId === null ? null : placeLinks([parentId])[0],
  places: placeLinks(placeIdsByParent.get(place.id)),
  books: bookLinks(bookIdsByPlace.get(place.id)),
  shorts: shortLinks(shortIdsByPlace.get(place.id)),
  villains: villainLinks(villainIdsByPlace.get(place.id)),
});

// parentId only exists to build the parent link, so it isn't returned
export const typeResponse = ({ parentId, ...type }: Type) => ({
  ...type,
  parent: parentId === null ? null : typeLinks([parentId])[0],
  types: typeLinks(typeIdsByParent.get(type.id)),
  villains: villainLinks(villainIdsByType.get(type.id)),
});

// A collection that's also a catalog book links to it
export const collectionResponse = (collection: Collection) => {
  const bookId = bookIdByCollection.get(collection.id);
  return {
    ...collection,
    book: bookId === undefined ? null : bookLinks([bookId])[0],
    shorts: shortLinks(shortIdsByCollection.get(collection.id)),
  };
};

export const publicationResponse = (publication: Publication) => ({
  ...publication,
  shorts: shortLinks(shortIdsByPublication.get(publication.id)),
});
