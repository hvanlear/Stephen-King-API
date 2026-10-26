import { Request, Response } from "express";
import { villains } from "../catalog";
import { villainResponse } from "../utils/responseHelper";
import { sendList } from "../utils/pagination";
import { parseId } from "../utils/parseId";

// The catalog never changes while the server runs, so build responses once
const responses = villains.map(villainResponse);
const responsesById = new Map(responses.map((villain) => [villain.id, villain]));

export const getOneVillain = (req: Request, res: Response) => {
  const id = parseId(req.params.id);
  if (id === null) {
    return res.status(400).json({ error: "Villain id must be a whole number" });
  }
  const villain = responsesById.get(id);
  if (!villain) {
    return res.status(404).json({ error: "Villain not found" });
  }
  res.json({ data: villain });
};

export const getVillains = (req: Request, res: Response) => {
  sendList(res, responses, req.query);
};
