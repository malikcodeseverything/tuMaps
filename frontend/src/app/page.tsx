"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowRight, MapPin, Route, Shield, Timer } from "lucide-react";
import CampusGlobe from "@/components/Landing/CampusGlobe";
import { prefetchOverlays, warmUp } from "@/services/api";
import type { HealthStatus } from "@/types";
import styles from "./landing.module.css";

const sections = [
  { id: "top", label: "Overview" },
  { id: "routes", label: "Route options" },
  { id: "data", label: "Incident data" },
  { id: "start", label: "Get walking" },
];

const modes = [
  { label: "Safest", icon: Shield, color: "#216746", copy: "Gives more weight to reported incidents and may take a longer path to avoid them." },
  { label: "Fastest", icon: Timer, color: "#245f95", copy: "Finds the route with the shortest estimated walking time." },
  { label: "Balanced", icon: Route, color: "#895025", copy: "Weighs walking time against past incidents, with less emphasis on detours." },
];

function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function Landing() {
  const [health, setHealth] = useState<HealthStatus | null>(null);

  // Wake the backend the moment the page loads. Reading this page usually
  // takes longer than the server needs to start, so the map opens warm.
  useEffect(() => {
    let cancelled = false;
    warmUp()
      .then((h) => {
        if (cancelled) return;
        setHealth(h);
        prefetchOverlays();
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const scene = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const elements = sections.map(({ id }) => document.getElementById(id));
    let frame = 0;

    function measure() {
      frame = 0;
      const center = window.innerHeight / 2;
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
      const progress = maxScroll > 0 ? window.scrollY / maxScroll : 0;
      scene.current?.style.setProperty("--scroll-progress", String(Math.min(1, Math.max(0, progress))));
      let closest = 0;
      let distance = Infinity;
      elements.forEach((element, index) => {
        if (!element) return;
        const bounds = element.getBoundingClientRect();
        const nextDistance = Math.abs(bounds.top + bounds.height / 2 - center);
        if (nextDistance < distance) {
          distance = nextDistance;
          closest = index;
        }
      });
      setActive(closest);
    }

    function schedule() {
      if (!frame) frame = requestAnimationFrame(measure);
    }

    measure();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div className={styles.landing} ref={scene} data-scene={active}>
      <div className={styles.progress} aria-hidden="true" />
      <header className={styles.header}>
        <a href="#top" className={styles.brand}><MapPin size={21} /> TuMaps</a>
        <nav aria-label="Main navigation">
          <a href="#routes">Route options</a>
          <a href="#data">How it works</a>
          <Link href="/map" className={styles.headerCta}>Open map <ArrowRight size={16} /></Link>
        </nav>
      </header>

      <nav className={styles.rail} aria-label="Page sections">
        {sections.map(({ id, label }, index) => (
          <a key={id} href={`#${id}`} aria-label={label} aria-current={active === index ? "location" : undefined}>
            <span>{label}</span>
          </a>
        ))}
      </nav>

      <div className={styles.globe}><CampusGlobe /></div>

      <main>
        <section id="top" className={`${styles.section} ${styles.hero}`} aria-labelledby="hero-title">
          <div className={styles.inner}>
            <p className={styles.eyebrow}><MapPin size={15} /> Temple University · Main Campus</p>
            <h1 id="hero-title">A better way<br />to <em>walk Temple.</em></h1>
            <p className={styles.lead}>Compare walking routes around campus by travel time and nearby reported incidents.</p>
            <div className={styles.actions}>
              <Link href="/map" className={styles.cta}>Open the map <ArrowRight size={18} /></Link>
              <a href="#routes" className={styles.secondary}>Explore route options <ArrowDown size={16} /></a>
            </div>
          </div>
        </section>

        <section id="routes" className={`${styles.section} ${styles.routes}`} aria-labelledby="routes-title">
          <div className={styles.inner}>
            <h2 id="routes-title">Compare <em>walking routes.</em></h2>
            <p className={styles.lead}>Enter a start and destination to compare estimated walking times and how each route weighs nearby incidents.</p>
            <ul className={styles.modes}>
              {modes.map(({ label, icon: Icon, color, copy }) => (
                <li key={label}>
                  <Icon size={21} color={color} aria-hidden="true" />
                  <div><h3>{label}</h3><p>{copy}</p></div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="data" className={`${styles.section} ${styles.data}`} aria-labelledby="data-title">
          <div className={styles.inner}>
            <h2 id="data-title">See what’s behind <em>the route.</em></h2>
            <p className={styles.lead}>TuMaps uses Philadelphia’s open incident data to score nearby street segments. More recent and more severe reports carry more weight.</p>
            {health && (
              <dl className={styles.stats}>
                <div><dt>Reported incidents</dt><dd>{health.incident_count.toLocaleString("en-US")}</dd></div>
                {health.data_through && <div><dt>Data through</dt><dd>{formatDate(health.data_through)}</dd></div>}
              </dl>
            )}
            <p className={styles.note}>Routes reflect historical reports. Conditions can change.</p>
            <figure className={styles.mapPreview}>
              <Image
                src="/campus-map-preview.jpg"
                alt="TuMaps centered on Temple’s Main Campus, with the route panel on the left"
                width={1280}
                height={720}
                sizes="(max-width: 760px) 90vw, 550px"
              />
              <figcaption>Main Campus in TuMaps</figcaption>
            </figure>
          </div>
        </section>

        <section id="start" className={`${styles.section} ${styles.start}`} aria-labelledby="start-title">
          <div className={styles.inner}>
            <h2 id="start-title">Where are you <em>headed?</em></h2>
            <Link href="/map" className={styles.cta}>Open the map <ArrowRight size={18} /></Link>
          </div>
        </section>
      </main>
    </div>
  );
}
