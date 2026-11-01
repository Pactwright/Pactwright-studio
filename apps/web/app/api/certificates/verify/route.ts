/** On-chain receipt verification against ReceiptAnchor contract (ROADMAP S-07, #55). */
import { verifyCertificateOnChain } from "@/lib/certificates";

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.json();
    const { batchId, leaf, proof, receiptAnchorId } = body ?? {};
    if (typeof batchId !== "number" || !leaf || !Array.isArray(proof)) {
      return Response.json(
        { error: "batchId (number), leaf (hex), and proof (array) are required" },
        { status: 400 }
      );
    }

    const result = await verifyCertificateOnChain({
      batchId,
      leaf: String(leaf),
      proof: proof.map(String),
      receiptAnchorId: receiptAnchorId ? String(receiptAnchorId) : undefined,
    });

    return Response.json(result);
  } catch (err) {
    console.error("On-chain verification route error:", err);
    return Response.json({ error: "Verification failed" }, { status: 500 });
  }
}
