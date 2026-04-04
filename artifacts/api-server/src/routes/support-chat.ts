import { Router, type IRouter } from "express";
import OpenAI from "openai";

const router: IRouter = Router();

const openai = new OpenAI({
  baseURL: process.env["AI_INTEGRATIONS_OPENAI_BASE_URL"],
  apiKey: process.env["AI_INTEGRATIONS_OPENAI_API_KEY"] ?? "placeholder",
});

const SYSTEM_PROMPT = `Eres Mia, una agente de soporte amable y profesional de Mander Casino. Ayudas a los usuarios con sus dudas sobre juegos, retiros, depósitos, bonos y cualquier problema que tengan. Respondes siempre en el mismo idioma que el usuario. Eres concisa, cálida y resolutiva. Si el usuario quiere cerrar el chat o ya no tiene más preguntas, responde despidiéndote y termina tu mensaje con la etiqueta [CERRAR_CHAT]. No uses markdown con asteriscos. Usa texto plano y emojis cuando sea apropiado. Nunca inventes información específica sobre montos, reglas o promociones que no conozcas.`;

router.post("/support-chat", async (req, res) => {
  const { messages, username } = req.body as {
    messages: { role: "user" | "assistant"; content: string }[];
    username?: string;
  };

  if (!Array.isArray(messages)) {
    res.status(400).json({ error: "messages must be an array" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  try {
    const systemContent = username
      ? `${SYSTEM_PROMPT} El usuario se llama ${username}.`
      : SYSTEM_PROMPT;

    const stream = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_completion_tokens: 8192,
      messages: [
        { role: "system", content: systemContent },
        ...messages,
      ],
      stream: true,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        res.write(`data: ${JSON.stringify({ content })}\n\n`);
      }
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err) {
    res.write(`data: ${JSON.stringify({ content: "Error al conectar con el soporte. Intentá de nuevo." })}\n\n`);
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  }
});

export default router;
