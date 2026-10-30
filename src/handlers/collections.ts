import { Request, Response } from "express";
import { collections } from "../catalog";
import { collectionResponse } from "../utils/responseHelper";
import { sendList } from "../utils/pagination";
import { parseId } from "../utils/parseId";

// The catalog never changes while the server runs, so build responses once
const responses = collections.map(collectionResponse);
const responsesById = new Map(responses.map((collection) => [collection.id, collection]));

export const getOneCollection = (req: Request, res: Response) => {
  const id = parseId(req.params.id);
  if (id === null) {
    return res.status(400).json({ error: "Collection id must be a whole number" });
  }
  const collection = responsesById.get(id);
  if (!collection) {
    return res.status(404).json({ error: "Collection not found" });
  }
  res.json({ data: collection });
};

export const getCollections = (req: Request, res: Response) => {
  sendList(res, responses, req.query);
};
