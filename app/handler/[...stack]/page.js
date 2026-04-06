import { StackHandler } from "@stackframe/stack";
import { stackServerApp } from "../../stack";

export default function Handler(props) {
  return <StackHandler app={stackServerApp} routeProps={props} fullPage />;
}
