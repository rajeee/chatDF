// Default MSW REST handlers for all API endpoints.
// Individual tests can override specific handlers via server.use(...).

import { http, HttpResponse } from "msw";
import {
  createUser,
  createConversation,
  createConversationList,
  createDataset,
  createUsageStats,
} from "./data";

export const handlers = [
  // Auth endpoints
  http.get("/auth/me", () => {
    return HttpResponse.json(createUser());
  }),

  http.post("/auth/google", () => {
    return HttpResponse.json({
      redirect_url: "https://accounts.google.com/o/oauth2/v2/auth?mock=true",
    });
  }),

  http.post("/auth/logout", () => {
    return HttpResponse.json({ success: true });
  }),

  http.post("/auth/dev-login", () => {
    return HttpResponse.json({ success: true });
  }),

  // Conversation endpoints
  http.get("/conversations", () => {
    return HttpResponse.json({
      conversations: createConversationList(0),
    });
  }),

  http.get("/conversations/:id", ({ params }) => {
    const conv = createConversation({
      id: params.id as string,
      title: "Test Conversation",
    });
    return HttpResponse.json(conv);
  }),

  http.post("/conversations", () => {
    return HttpResponse.json(createConversation(), { status: 201 });
  }),

  http.patch("/conversations/:id", async ({ params, request }) => {
    const body = (await request.json()) as { title?: string };
    return HttpResponse.json(
      createConversation({
        id: params.id as string,
        title: body.title ?? "Renamed Conversation",
      })
    );
  }),

  http.delete("/conversations/:id", () => {
    return HttpResponse.json({ success: true });
  }),

  http.delete("/conversations", () => {
    return HttpResponse.json({ success: true });
  }),

  // Message endpoints
  http.post("/conversations/:id/messages", () => {
    return HttpResponse.json({
      message_id: "msg-1",
      status: "processing",
    });
  }),

  http.post("/conversations/:id/stop", () => {
    return HttpResponse.json({ success: true });
  }),

  // Dataset endpoints
  http.post("/conversations/:id/datasets", () => {
    return HttpResponse.json(
      { dataset_id: "ds-1", status: "loading" },
      { status: 201 }
    );
  }),

  http.delete("/conversations/:id/datasets/:datasetId", () => {
    return HttpResponse.json({ success: true });
  }),

  http.get("/conversations/:id/datasets/:datasetId", ({ params }) => {
    return HttpResponse.json(
      createDataset({
        id: params.datasetId as string,
        conversation_id: params.id as string,
      })
    );
  }),

  // Usage endpoints
  http.get("/usage", () => {
    return HttpResponse.json(createUsageStats());
  }),
];
