/** 501 response for scaffold routes, naming the ROADMAP task. */
export function notImplemented(task: string): Response {
  return Response.json({ error: "not_implemented", roadmapTask: task }, { status: 501 });
}
