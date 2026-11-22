"use client";

import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { ScrollToPlugin } from "gsap/ScrollToPlugin";
import { Flip } from "gsap/Flip";
import { Draggable } from "gsap/Draggable";
import { useGSAP } from "@gsap/react";
import { Observer } from "gsap/Observer"; // 1. Thêm import này


if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger, ScrollToPlugin, Flip, Draggable, Observer, useGSAP);
  // Default configurations
  ScrollTrigger.config({ ignoreMobileResize: true });
}

export { gsap, ScrollTrigger, ScrollToPlugin, Flip, Draggable, Observer, useGSAP };
