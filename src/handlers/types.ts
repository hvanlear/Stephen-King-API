import { Request, Response } from "express";
import { types } from "../catalog";
import { typeResponse } from "../utils/responseHelper";
import { sendList } from "../utils/pagination";
import { parseId } from "../utils/parseId";

// The catalog never changes while the server runs, so build responses once
const responses = types.map(typeResponse);
const responsesById = new Map(responses.map((type) => [type.id, type]));

export const getOneType = (req: Request, res: Response) => {
  const id = parseId(req.params.id);
  if (id === null) {
    return res.status(400).json({ error: "Type id must be a whole number" });
  }
  const type = responsesById.get(id);
  if (!type) {
    return res.status(404).json({ error: "Type not found" });
  }
  res.json({ data: type });
};

export const getTypes = (req: Request, res: Response) => {
  sendList(res, responses, req.query);
};
