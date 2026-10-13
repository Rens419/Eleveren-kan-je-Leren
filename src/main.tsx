import React from "react";
import ReactDOM from "react-dom/client";
import { inTauri } from "./lib/api";
import { StoreProvider } from "./lib/store";
import { Panel } from "./views/Panel";
import { Settings } from "./views/Settings";
import "./styles.css";

const isSettings = new URLSearchParams(location.search).get("window") === "settings";
if (!inTauri) document.documentElement.classList.add("web");
if (isSettings) document.documentElement.classList.add("settings");

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <StoreProvider>{isSettings ? <Settings /> : <Panel />}</StoreProvider>
  </React.StrictMode>,
);
