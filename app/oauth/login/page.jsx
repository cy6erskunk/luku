"use client";
import { OAuthLogin } from "../../components/OAuthScreens.jsx";

// Where Neon Auth sends a browser to sign in while an MCP client connects.
export default function Page() {
  return <OAuthLogin />;
}
