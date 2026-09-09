"""
MARS MISSION LAB — Physics "Kerbal-style" classroom simulator
==============================================================

A self-contained educational orbital-mechanics sandbox.

Features
--------
* Earth-centered LEO setup
* User-controlled launch altitude, prograde launch angle and launch speed
* Live velocity vector, radial/tangential velocity components
* Periapsis / apoapsis detection
* Escape detection
* Automatic classification: suborbital / elliptical / circular-ish / escape
* Heliocentric patched-conic injection after Earth escape
* Hohmann transfer reference orbit
* Mars launch-window / phase-angle challenge
* "Exam / Challenge" mode with hidden target phase and score
* Animated Sun-Earth-Mars-spacecraft view
* Kepler 3rd law panel
* Vis-viva equation panel
* Mission log and live telemetry

Educational model
------------------
This is intentionally NOT a flight-certified trajectory tool. It uses:
  - planar motion
  - point-mass gravity
  - circular Earth/Mars heliocentric orbits
  - patched-conic approximation
  - impulsive launch at a selected LEO altitude
  - a simplified heliocentric injection model

Dependencies:
    pip install numpy matplotlib

Run:
    python mars_mission_lab.py
"""

from __future__ import annotations

import math
import random
import tkinter as tk
from dataclasses import dataclass
from tkinter import messagebox, ttk

import numpy as np
from matplotlib.backends.backend_tkagg import FigureCanvasTkAgg
from matplotlib.figure import Figure


# ============================================================
# Constants
# ============================================================

AU = 149_597_870.7       # km
DAY = 86_400.0           # s

MU_SUN = 1.32712440018e11 # km^3/s^2
MU_EARTH = 398_600.4418   # km^3/s^2
MU_MARS = 42_828.375214   # km^3/s^2

R_EARTH = 6_378.137       # km
R_MARS = 3_389.5          # km

EARTH_ORBIT_AU = 1.0
MARS_ORBIT_AU = 1.523679

R_EARTH_ORBIT = EARTH_ORBIT_AU * AU
R_MARS_ORBIT = MARS_ORBIT_AU * AU

EARTH_YEAR_DAYS = 365.2568983
MARS_YEAR_DAYS = 686.980

G0 = math.sqrt(MU_EARTH / R_EARTH)


# ============================================================
# Math helpers
# ============================================================

def norm(v: np.ndarray) -> float:
    return float(np.linalg.norm(v))


def unit(v: np.ndarray) -> np.ndarray:
    n = norm(v)
    if n < 1e-14:
        return np.zeros(2)
    return v / n


def rotate(v: np.ndarray, theta: float) -> np.ndarray:
    c, s = math.cos(theta), math.sin(theta)
    return np.array([c*v[0] - s*v[1], s*v[0] + c*v[1]])


def wrap_pi(x: float) -> float:
    return (x + math.pi) % (2*math.pi) - math.pi


def wrap_2pi(x: float) -> float:
    return x % (2*math.pi)


def fmt(x: float, digits=3) -> str:
    return f"{x:,.{digits}f}"


def scientific(x: float) -> str:
    if abs(x) < 1e-12:
        return "0"
    return f"{x:.3e}"


# ============================================================
# Hohmann reference
# ============================================================

@dataclass
class Hohmann:
    r1: float
    r2: float
    a: float
    e: float
    earth_speed: float
    mars_speed: float
    perihelion_speed: float
    apohelion_speed: float
    dv_depart: float
    dv_arrive: float
    transfer_time_days: float
    ideal_phase_deg: float
    vinf: float
    c3: float


def hohmann_reference() -> Hohmann:
    r1, r2 = R_EARTH_ORBIT, R_MARS_ORBIT
    a = 0.5 * (r1 + r2)
    e = (r2-r1)/(r2+r1)

    v1 = math.sqrt(MU_SUN/r1)
    v2 = math.sqrt(MU_SUN/r2)

    vp = math.sqrt(MU_SUN*(2/r1 - 1/a))
    va = math.sqrt(MU_SUN*(2/r2 - 1/a))

    t = math.pi * math.sqrt(a**3/MU_SUN)

    n_mars = math.sqrt(MU_SUN/r2**3)
    phase = wrap_2pi(math.pi - n_mars*t)

    vinf = abs(vp-v1)

    return Hohmann(
        r1=r1, r2=r2, a=a, e=e,
        earth_speed=v1, mars_speed=v2,
        perihelion_speed=vp, apohelion_speed=va,
        dv_depart=vp-v1, dv_arrive=v2-va,
        transfer_time_days=t/DAY,
        ideal_phase_deg=math.degrees(phase),
        vinf=vinf, c3=vinf**2
    )


HOHMANN = hohmann_reference()


# ============================================================
# Earth-centered launch orbit
# ============================================================

@dataclass
class LaunchState:
    altitude_km: float
    radius_km: float
    speed_km_s: float
    flight_path_angle_deg: float
    position: np.ndarray
    velocity: np.ndarray
    specific_energy: float
    angular_momentum: float
    eccentricity: float
    semi_major_axis_km: float
    periapsis_km: float
    apoapsis_km: float
    period_s: float
    escape: bool
    impact: bool
    classification: str
    dv_from_circular: float


def launch_state(altitude_km: float, speed_km_s: float,
                 flight_path_angle_deg: float) -> LaunchState:
    altitude_km = max(120.0, float(altitude_km))
    r = R_EARTH + altitude_km
    speed = max(0.0, float(speed_km_s))
    gamma = math.radians(float(flight_path_angle_deg))

    # Start at +x, with prograde direction +y.
    pos = np.array([r, 0.0])
    radial = np.array([1.0, 0.0])
    tangential = np.array([0.0, 1.0])

    vel = speed * (math.cos(gamma)*tangential + math.sin(gamma)*radial)

    energy = 0.5*speed**2 - MU_EARTH/r
    h = abs(pos[0] * vel[1] - pos[1] * vel[0])
    e2 = max(0.0, 1.0 + 2*energy*h*h/(MU_EARTH**2))
    e = math.sqrt(e2)

    circular_speed = math.sqrt(MU_EARTH/r)

    escape = energy >= 0
    impact = False
    a = float("inf") if abs(energy) < 1e-12 else -MU_EARTH/(2*energy)

    if not escape:
        rp = a*(1-e)
        ra = a*(1+e)
        if rp < R_EARTH:
            impact = True
        period = 2*math.pi*math.sqrt(a**3/MU_EARTH)
    else:
        # For hyperbolic trajectories, "apoapsis" is undefined.
        rp = h*h/(MU_EARTH*(1+e)) if h > 0 else 0.0
        ra = float("inf")
        period = float("inf")

    if impact:
        classification = "IMPACT / SUBORBITAL"
    elif escape:
        classification = "ESCAPE TRAJECTORY"
    elif abs(e) < 0.02:
        classification = "NEAR-CIRCULAR ORBIT"
    else:
        classification = "ELLIPTICAL ORBIT"

    return LaunchState(
        altitude_km=altitude_km,
        radius_km=r,
        speed_km_s=speed,
        flight_path_angle_deg=flight_path_angle_deg,
        position=pos, velocity=vel,
        specific_energy=energy,
        angular_momentum=h,
        eccentricity=e,
        semi_major_axis_km=a,
        periapsis_km=rp,
        apoapsis_km=ra,
        period_s=period,
        escape=escape, impact=impact,
        classification=classification,
        dv_from_circular=speed-circular_speed
    )


# ============================================================
# LEO orbit plotting
# ============================================================

def earth_orbit_points(state: LaunchState, count=600):
    """
    Plot the conic for the state in the local orbital plane.

    The launch point is +x. For classroom visualization we solve the
    conic in polar form around Earth. For elliptic trajectories we
    sample true anomaly around the orbit.
    """
    e = state.eccentricity
    h = state.angular_momentum
    if h < 1e-10:
        return np.zeros((2, 2))

    p = h*h/MU_EARTH

    # Direction of periapsis from eccentricity vector.
    rhat = unit(state.position)
    v = state.velocity
    hvec_z = state.position[0] * v[1] - state.position[1] * v[0]
    evec = ((norm(v)**2 - MU_EARTH/state.radius_km)*state.position
            - np.dot(state.position, v)*v) / MU_EARTH

    if norm(evec) < 1e-8:
        peri_angle = math.pi
    else:
        peri_angle = math.atan2(evec[1], evec[0])

    if e < 1:
        nu_max = math.pi
        nus = np.linspace(-nu_max, nu_max, count)
        rr = p/(1+e*np.cos(nus))
        xy = np.column_stack([
            rr*np.cos(nus),
            rr*np.sin(nus)
        ])
        # The angle nu is measured from periapsis.
        c, s = math.cos(peri_angle), math.sin(peri_angle)
        rot = np.array([[c, -s], [s, c]])
        return xy @ rot.T

    # Hyperbola: show a bounded useful section.
    nu_lim = min(math.acos(max(-0.999, -1/e))-0.03, math.radians(170))
    nus = np.linspace(-nu_lim, nu_lim, count)
    denom = 1 + e*np.cos(nus)
    rr = p/denom
    good = rr > 0
    xy = np.column_stack([rr[good]*np.cos(nus[good]),
                           rr[good]*np.sin(nus[good])])
    c, s = math.cos(peri_angle), math.sin(peri_angle)
    rot = np.array([[c, -s], [s, c]])
    return xy @ rot.T


# ============================================================
# Heliocentric mission model
# ============================================================

@dataclass
class Mission:
    launch_speed: float
    flight_path_angle_deg: float
    earth_phase_deg: float
    mars_phase_offset_deg: float
    transfer_time_days: float
    heliocentric_v_depart: float
    heliocentric_v_arrive: float
    vinf: float
    c3: float
    arrival_miss_km: float
    arrival_relative_speed_km_s: float
    success: bool


def mission_from_controls(
    launch_speed_km_s: float,
    flight_path_angle_deg: float,
    mars_phase_offset_deg: float,
    tolerance_km: float
) -> Mission:
    """
    Approximate coupling between Earth escape speed and heliocentric transfer.

    If the launch is prograde, Earth departure hyperbolic excess is taken
    from energy. A near-Hohmann speed is therefore mapped to a heliocentric
    departure speed v_Earth + v_inf.

    The transfer ellipse is then defined by the Hohmann reference when the
    launch is near the required injection energy. The phase slider determines
    Mars's initial phase relative to the ideal phase.

    This is a teaching approximation: students can explore why both speed
    and phase matter without needing a full n-body integrator.
    """
    earth = launch_state(250.0, launch_speed_km_s, flight_path_angle_deg)

    if earth.escape:
        vinf = math.sqrt(max(0.0, 2*earth.specific_energy))
    else:
        vinf = 0.0

    # Heliocentric departure speed vector magnitude, assuming prograde
    # Earth departure.
    v_helio_depart = HOHMANN.earth_speed + vinf

    # Use a vis-viva-compatible semi-major axis from departure speed.
    inv_a = 2/R_EARTH_ORBIT - v_helio_depart**2/MU_SUN
    if inv_a > 0:
        a = 1/inv_a
        transfer_time_days = math.pi*math.sqrt(a**3/MU_SUN)/DAY
        r_arrive = R_MARS_ORBIT
        if 2/r_arrive - 1/a > 0:
            v_arrive = math.sqrt(MU_SUN*(2/r_arrive - 1/a))
        else:
            v_arrive = float("nan")
    else:
        # Unbound heliocentric path; not a Mars transfer.
        a = float("inf")
        transfer_time_days = 9999.0
        v_arrive = float("nan")

    # Mars starts at ideal Hohmann phase + student offset.
    ideal = HOHMANN.ideal_phase_deg
    initial_phase = math.radians(ideal + mars_phase_offset_deg)

    # Circular Mars motion.
    n_mars = HOHMANN.mars_speed/R_MARS_ORBIT
    mars_arrival_angle = initial_phase + n_mars*(transfer_time_days*DAY)

    # The transfer reaches apoapsis approximately opposite the departure
    # direction. Speed mismatch is reflected in arrival relative speed.
    sc_arrival_angle = math.pi

    angle_error = wrap_pi(mars_arrival_angle - sc_arrival_angle)
    miss = 2*R_MARS_ORBIT*abs(math.sin(angle_error/2))

    # Better local approximation for arrival relative speed.
    if math.isfinite(v_arrive):
        # Spacecraft is radial/tangential depending on its conic.
        # Use tangential approximation near Mars encounter.
        rel = math.sqrt(
            max(0.0, v_arrive**2 + HOHMANN.mars_speed**2
                - 2*v_arrive*HOHMANN.mars_speed*math.cos(angle_error))
        )
    else:
        rel = float("nan")

    speed_ok = abs(vinf - HOHMANN.vinf) < 1.0
    success = (
        earth.escape
        and math.isfinite(v_arrive)
        and miss <= tolerance_km
        and speed_ok
    )

    return Mission(
        launch_speed=launch_speed_km_s,
        flight_path_angle_deg=flight_path_angle_deg,
        earth_phase_deg=0.0,
        mars_phase_offset_deg=mars_phase_offset_deg,
        transfer_time_days=transfer_time_days,
        heliocentric_v_depart=v_helio_depart,
        heliocentric_v_arrive=v_arrive,
        vinf=vinf,
        c3=vinf**2,
        arrival_miss_km=miss,
        arrival_relative_speed_km_s=rel,
        success=success
    )


# ============================================================
# Main application
# ============================================================


MERCURY_AU = 0.387098

VENUS_AU = 0.723332

EARTH_AU = 1.0

MARS_AU = 1.523679

JUPITER_AU = 5.2044

SATURN_AU = 9.5826

URANUS_AU = 19.1913

NEPTUNE_AU = 30.07

PLUTO_AU = 39.482

MERCURY_MASS = 3.3011e+23

VENUS_MASS = 4.8675e+24

EARTH_MASS = 5.9724e+24

MARS_MASS = 6.4171e+23

JUPITER_MASS = 1.8982e+27

SATURN_MASS = 5.6834e+26

URANUS_MASS = 8.681e+25

NEPTUNE_MASS = 1.0241e+26

PLUTO_MASS = 1.309e+22

class MarsMissionLab:
    """Orbital Mission Lab: compact teaching interface + independent challenges."""

    PLANET_COLORS = {
        "Mercúrio": "#A9A9A9",
        "Vénus": "#D9A441",
        "Terra": "#4A90E2",
        "Marte": "#C75C3C",
        "Júpiter": "#C28B5A",
        "Saturno": "#D8B56A",
        "Urano": "#6FC7D8",
        "Neptuno": "#4169E1",
        "Plutão": "#8C8175",
    }

    PLANETS = {
        "Mercúrio": MERCURY_AU, "Vénus": VENUS_AU, "Terra": EARTH_AU,
        "Marte": MARS_AU, "Júpiter": JUPITER_AU, "Saturno": SATURN_AU,
        "Urano": URANUS_AU, "Neptuno": NEPTUNE_AU, "Plutão": PLUTO_AU,
    }

    def __init__(self, root):
        self.root = root
        self.root.title("ORBITAL MISSION LAB")
        self.root.geometry("1450x880")
        self.root.minsize(1100, 700)

        self.bg = "#0b1020"
        self.panel = "#151c30"
        self.card = "#1c2740"
        self.text = "#edf2ff"
        self.muted = "#aab6d0"
        self.accent = "#74a7ff"
        self.good = "#7bdba2"
        self.warn = "#ffd166"
        self.bad = "#ff7f7f"

        self.mode = tk.StringVar(value="ensino")
        self.origin = tk.StringVar(value="Terra")
        self.destination = tk.StringVar(value="Marte")

        self.answer_a = tk.StringVar()
        self.answer_dv = tk.StringVar()
        self.answer_time = tk.StringVar()
        self.answer_phase = tk.StringVar()
        self.answer_energy = tk.StringVar()

        self.challenge = None
        self.score = 0
        self.attempts = 0
        self.answer_entries = []
        self.answer_feedback = []

        self._style()
        self._ui()
        self._new_challenge()
        self._update()

    def _style(self):
        s = ttk.Style()
        try:
            s.theme_use("clam")
        except tk.TclError:
            pass
        s.configure(".", background=self.bg, foreground=self.text)
        s.configure("TFrame", background=self.bg)
        s.configure("Panel.TFrame", background=self.panel)
        s.configure("Card.TFrame", background=self.card)
        s.configure("TLabel", background=self.bg, foreground=self.text)
        s.configure("Panel.TLabel", background=self.panel, foreground=self.text)
        s.configure("Card.TLabel", background=self.card, foreground=self.text)
        s.configure("Muted.TLabel", background=self.bg, foreground=self.muted)
        s.configure("Title.TLabel", background=self.panel, foreground=self.text,
                    font=("Segoe UI", 21, "bold"))
        s.configure("CardTitle.TLabel", background=self.card, foreground=self.text,
                    font=("Segoe UI", 12, "bold"))
        s.configure("TNotebook", background=self.bg, borderwidth=0)
        s.configure("TNotebook.Tab", padding=(16, 8))

        # Answer fields in Challenge mode: white background + black text.
        # ttk.Entry needs its own style; changing tk.Entry options is not enough.
        s.configure(
            "Challenge.TEntry",
            fieldbackground="white",
            foreground="black",
            insertcolor="black",
            padding=5,
        )
        s.map(
            "Challenge.TEntry",
            foreground=[("disabled", "#666666"), ("!disabled", "black")],
            fieldbackground=[("disabled", "#eeeeee"), ("!disabled", "white")],
        )
        s.configure("Correct.TEntry", fieldbackground="#dff5e5",
                    foreground="#146b35", insertcolor="#146b35", padding=5)
        s.configure("Wrong.TEntry", fieldbackground="#ffe1e1",
                    foreground="#9b1c1c", insertcolor="#9b1c1c", padding=5)

    def _ui(self):
        header = ttk.Frame(self.root, style="Panel.TFrame")
        header.pack(fill="x", padx=12, pady=(12, 6))
        ttk.Label(header, text="ORBITAL MISSION LAB",
                  style="Title.TLabel").pack(side="left", padx=12, pady=10)
        ttk.Label(header, text="Física aplicada • Engenharia e Gestão Industrial",
                  style="Muted.TLabel").pack(side="left", padx=10)
        ttk.Button(header, text="📘 Ensino",
                   command=lambda: self._mode("ensino")).pack(side="right", padx=4)
        ttk.Button(header, text="🎯 Desafio",
                   command=lambda: self._mode("desafio")).pack(side="right", padx=4)

        body = ttk.Frame(self.root)
        body.pack(fill="both", expand=True, padx=12, pady=6)

        self.left = ttk.Frame(body, style="Panel.TFrame", width=325)
        self.left.pack(side="left", fill="y", padx=(0, 7))
        self.left.pack_propagate(False)

        center = ttk.Frame(body, style="Panel.TFrame")
        center.pack(side="left", fill="both", expand=True, padx=7)

        self.right = ttk.Frame(body, style="Panel.TFrame", width=325)
        self.right.pack(side="right", fill="y", padx=(7, 0))
        self.right.pack_propagate(False)

        self._left()
        self._center(center)
        self._right()

    def _clear(self, f):
        for w in f.winfo_children():
            w.destroy()

    def _card(self, parent, title):
        f = ttk.Frame(parent, style="Card.TFrame", padding=12)
        f.pack(fill="x", pady=6)
        ttk.Label(f, text=title, style="CardTitle.TLabel").pack(anchor="w", pady=(0, 8))
        return f

    def _formula(self, parent, title, formula, fontsize=16):
        """Render a real mathematical formula with Matplotlib mathtext."""
        ttk.Label(
            parent, text=title, style="Card.TLabel",
            font=("Segoe UI", 9, "bold")
        ).pack(anchor="w", pady=(3, 0))

        fig = Figure(figsize=(3.0, 0.48), dpi=100,
                     facecolor=self.card)
        ax = fig.add_axes([0, 0, 1, 1])
        ax.set_facecolor(self.card)
        ax.axis("off")
        ax.text(
            0.02, 0.50, formula,
            color=self.text, fontsize=fontsize,
            va="center", ha="left"
        )

        canvas = FigureCanvasTkAgg(fig, master=parent)
        widget = canvas.get_tk_widget()
        widget.configure(
            background=self.card,
            highlightthickness=0,
            height=42
        )
        widget.pack(fill="x", pady=(0, 3))
        canvas.draw()
        return canvas

    def _left(self):
        self._clear(self.left)
        if self.mode.get() == "ensino":
            self._teaching()
        else:
            self._challenge_ui()

    def _teaching(self):
        c = self._card(self.left, "Missão de aprendizagem")

        ttk.Label(c, text="Origem", style="Card.TLabel").pack(anchor="w")
        ttk.Combobox(c, textvariable=self.origin,
                     values=list(self.PLANETS), state="readonly").pack(fill="x", pady=3)
        ttk.Label(c, text="Destino", style="Card.TLabel").pack(anchor="w", pady=(7, 0))
        ttk.Combobox(c, textvariable=self.destination,
                     values=list(self.PLANETS), state="readonly").pack(fill="x", pady=3)
        ttk.Button(c, text="Calcular transferência",
                   command=self._update).pack(fill="x", pady=(8, 0))

        c = self._card(self.left, "Ferramentas matemáticas")
        for title, formula in [
            ("Velocidade orbital circular", r"$v = \sqrt{\frac{\mu}{r}}$"),
            ("Equação de vis-viva", r"$v = \sqrt{\mu\left(\frac{2}{r}-\frac{1}{a}\right)}$"),
            ("Semi-eixo da transferência", r"$a = \frac{r_1+r_2}{2}$"),
            ("Tempo de transferência", r"$t = \pi\sqrt{\frac{a^3}{\mu}}$"),
            ("Velocidade angular", r"$n = \sqrt{\frac{\mu}{r^3}}$"),
            ("Ângulo de fase", r"$\phi = \pi-n_2t$"),
            ("Variação de velocidade", r"$\Delta v = \left|v_2-v_1\right|$"),
            ("Energia cinética", r"$E_k = \frac{1}{2}mv^2$"),
        ]:
            self._formula(c, title, formula)

        c = self._card(self.left, "Método")
        ttk.Label(
            c,
            text="1. Define r₁ e r₂\n"
                 "2. Calcula a = (r₁ + r₂)/2\n"
                 "3. Usa vis-viva para obter as velocidades\n"
                 "4. Calcula Δv em cada manobra\n"
                 "5. Calcula a energia: Eₖ = ½mv²\n"
                 "6. Calcula o tempo e a fase",
            style="Card.TLabel", justify="left"
        ).pack(anchor="w")

    def _challenge_ui(self):
        c = self._card(self.left, "Nova missão")
        ttk.Button(c, text="🎲 Gerar missão",
                   command=self._new_challenge).pack(fill="x", pady=(0, 4))

        c = self._card(self.left, "Calcula sem ajuda")
        entries = [
            ("a da transferência (AU)", self.answer_a),
            ("Δv total (km/s)", self.answer_dv),
            ("tempo (dias)", self.answer_time),
            ("fase de lançamento (°)", self.answer_phase),
            ("Energia cinética total (MJ)", self.answer_energy),
        ]
        self.answer_entries = []
        self.answer_feedback = []
        for label, var in entries:
            ttk.Label(c, text=label, style="Card.TLabel").pack(anchor="w")
            entry = ttk.Entry(c, textvariable=var, style="Challenge.TEntry")
            entry.pack(fill="x", pady=(2, 2))
            self.answer_entries.append(entry)

            feedback = ttk.Label(c, text="", style="Card.TLabel",
                                 justify="left", wraplength=330)
            feedback.pack(anchor="w", pady=(0, 6))
            self.answer_feedback.append(feedback)

        ttk.Button(c, text="✓ Corrigir respostas",
                   command=self._check).pack(fill="x")

    def _center(self, parent):
        self.fig = Figure(figsize=(7, 6), dpi=100, facecolor=self.bg)
        self.ax = self.fig.add_subplot(111)
        self.canvas = FigureCanvasTkAgg(self.fig, master=parent)
        self.canvas.get_tk_widget().pack(fill="both", expand=True)
        self.status = ttk.Label(parent, text="", style="Muted.TLabel")
        self.status.pack(fill="x", pady=6)

    def _right(self):
        self._clear(self.right)

        if self.mode.get() == "desafio":
            c = self._card(self.right, "Fórmulas de apoio")
            formulas = [
                ("Velocidade circular", r"$v = \sqrt{\frac{\mu}{r}}$"),
                ("Vis-viva", r"$v = \sqrt{\mu\left(\frac{2}{r}-\frac{1}{a}\right)}$"),
                ("Variação de velocidade", r"$\Delta v = \left|v_2-v_1\right|$"),
                ("Energia cinética", r"$E_k = \frac{1}{2}mv^2$"),
                ("Tempo", r"$t = \pi\sqrt{\frac{a^3}{\mu}}$"),
                ("Velocidade angular", r"$n = \sqrt{\frac{\mu}{r^3}}$"),
                ("Fase", r"$\phi = \pi-n_2t$"),
            ]
            for title, formula in formulas:
                self._formula(c, title, formula, fontsize=15)

            c = self._card(self.right, "Dados fornecidos")
            if self.challenge:
                for k, v in self.challenge["data"]:
                    ttk.Label(c, text=f"{k}: {v}", style="Card.TLabel").pack(anchor="w", pady=2)
            return

        c = self._card(self.right, "Resultados")

        self.out = {}
        labels = [
            ("a transferência", "a"),
            ("Δv saída", "dv1"),
            ("Δv chegada", "dv2"),
            ("Δv total", "dv"),
            ("tempo", "time"),
            ("fase", "phase"),
            ("energia", "energy"),
        ]
        for label, key in labels:
            row = ttk.Frame(c, style="Card.TFrame")
            row.pack(fill="x", pady=3)
            ttk.Label(row, text=label, style="Card.TLabel").pack(side="left")
            var = tk.StringVar(value="—")
            self.out[key] = var
            ttk.Label(row, textvariable=var, style="Card.TLabel",
                      font=("Segoe UI", 10, "bold")).pack(side="right")

        c = self._card(self.right, "Método")
        self.explain = ttk.Label(c, text="", style="Card.TLabel",
                                 wraplength=280, justify="left")
        self.explain.pack(anchor="w")

        c = self._card(self.right, "Nota")
        ttk.Label(
            c,
            text="Modelo educativo: órbitas planetárias circulares, "
                 "transferência de Hohmann e aproximação de dois corpos. "
                 "O objetivo é calcular, interpretar e testar.",
            style="Card.TLabel", wraplength=280, justify="left"
        ).pack(anchor="w")

    def _mode(self, mode):
        self.mode.set(mode)
        self._left()
        self._right()
        self._update()

    def _transfer(self, r1, r2, mass_kg=1000.0):
        r1k = r1 * AU
        r2k = r2 * AU
        a = (r1k + r2k) / 2
        v1 = math.sqrt(MU_SUN / r1k)
        v2 = math.sqrt(MU_SUN / r2k)
        vt1 = math.sqrt(MU_SUN * (2/r1k - 1/a))
        vt2 = math.sqrt(MU_SUN * (2/r2k - 1/a))
        dv1 = abs(vt1 - v1)
        dv2 = abs(v2 - vt2)
        t = math.pi * math.sqrt(a**3 / MU_SUN)
        n2 = math.sqrt(MU_SUN / r2k**3)
        phase = (math.pi - n2*t) * 180 / math.pi

        # Educational definition: total magnitude of the kinetic-energy
        # changes associated with the two impulsive velocity changes.
        # The arrival maneuver is braking, so its kinetic-energy change is
        # negative; for "energy involved in the maneuvers" we use abs().
        dE1 = 0.5 * mass_kg * ((vt1 * 1000)**2 - (v1 * 1000)**2)
        dE2 = 0.5 * mass_kg * ((v2 * 1000)**2 - (vt2 * 1000)**2)
        energy_total_MJ = (abs(dE1) + abs(dE2)) / 1e6

        return {
            "a": a/AU, "dv1": dv1, "dv2": dv2, "dv": dv1+dv2,
            "time": t/DAY, "phase": phase,
            "energy": energy_total_MJ,
            "dE1": dE1 / 1e6,
            "dE2": dE2 / 1e6,
        }

    def _new_challenge(self):
        choices = [p for p in self.PLANETS if p != "Terra"]
        dest = random.choice(choices)
        r1 = self.PLANETS["Terra"]
        r2 = self.PLANETS[dest]
        self.origin.set("Terra")
        self.destination.set(dest)
        mass = random.choice([750, 1000, 1500, 2500, 5000])
        calc = self._transfer(r1, r2, mass)

        # New visual seed for this mission: the mission diagram is regenerated
        # with a different orbital phase each time the user clicks "Gerar missão".
        self.mission_visual_seed = random.randint(0, 2**31 - 1)

        self.challenge = {
            "dest": dest, "calc": calc,
            "data": [
                ("Origem", "Terra"),
                ("Destino", dest),
                ("r₁", f"{r1:.3f} AU"),
                ("r₂", f"{r2:.3f} AU"),
                ("Massa da nave", f"{mass:,} kg"),
                ("μ☉", f"{MU_SUN:.3e} km³/s²"),
            ]
        }
        for v in [
            self.answer_a, self.answer_dv, self.answer_time,
            self.answer_phase, self.answer_energy
        ]:
            v.set("")
        self.score = 0
        self.attempts = 0
        if self.mode.get() == "desafio":
            self._left()
            self._right()
        self._update()

    def _number(self, var):
        try:
            return float(var.get().replace(",", "."))
        except Exception:
            return None

    def _check(self):
        if not self.challenge:
            return

        variables = [
            self.answer_a, self.answer_dv,
            self.answer_time, self.answer_phase, self.answer_energy
        ]
        vals = [self._number(v) for v in variables]

        if any(v is None for v in vals):
            messagebox.showwarning(
                "Respostas",
                "Preenche os campos com números válidos."
            )
            return

        c = self.challenge["calc"]
        refs = [c["a"], c["dv"], c["time"], c["phase"], c["energy"]]
        tol = [0.01, 0.05, 2.0, 3.0, max(0.5, 0.01*c["energy"])]
        names = ["Semi-eixo", "Δv total", "Tempo", "Fase", "Energia cinética total"]

        good = [abs(x - y) <= t for x, y, t in zip(vals, refs, tol)]
        self.attempts += 1
        self.score = round(sum(good) * 20)

        # Paint each answer independently and explain the error.
        for i, (ok, value, ref, tolerance, name) in enumerate(
            zip(good, vals, refs, tol, names)
        ):
            if i < len(self.answer_entries):
                self.answer_entries[i].configure(
                    style="Correct.TEntry" if ok else "Wrong.TEntry"
                )

            if i < len(self.answer_feedback):
                if ok:
                    self.answer_feedback[i].configure(
                        text=f"✓ Correto — valor de referência: {ref:.3f}"
                             if i == 0 else
                             f"✓ Correto — valor de referência: {ref:.2f}",
                        foreground=self.good
                    )
                else:
                    diff = value - ref
                    if i == 0:
                        expected = f"{ref:.3f} AU"
                        difference = f"{diff:+.3f} AU"
                    elif i == 1:
                        expected = f"{ref:.2f} km/s"
                        difference = f"{diff:+.2f} km/s"
                    elif i == 2:
                        expected = f"{ref:.1f} dias"
                        difference = f"{diff:+.1f} dias"
                    elif i == 3:
                        expected = f"{ref:.1f}°"
                        difference = f"{diff:+.1f}°"
                    else:
                        expected = f"{ref:.2f} MJ"
                        difference = f"{diff:+.2f} MJ"

                    self.answer_feedback[i].configure(
                        text=f"✗ Incorreto — correto: {expected}  |  "
                             f"a tua resposta está {difference} em relação ao correto",
                        foreground=self.bad
                    )

        wrong = [n for n, ok in zip(names, good) if not ok]

        if all(good):
            self.status.configure(
                text="🎯 Todas as respostas estão corretas — 100/100",
                foreground=self.good
            )
        else:
            self.status.configure(
                text=f"Pontuação: {self.score}/100  •  Rever: {', '.join(wrong)}",
                foreground=self.warn
            )

    def _update(self):
        origin = self.origin.get()
        dest = self.destination.get()
        if origin == dest:
            return

        c = self._transfer(self.PLANETS[origin], self.PLANETS[dest], 1000.0)

        for key, fmt in [
            ("a", f"{c['a']:.3f} AU"),
            ("dv1", f"{c['dv1']:.3f} km/s"),
            ("dv2", f"{c['dv2']:.3f} km/s"),
            ("dv", f"{c['dv']:.3f} km/s"),
            ("time", f"{c['time']:.1f} dias"),
            ("phase", f"{c['phase']:.1f}°"),
            ("energy", f"{c['energy']:.2f} MJ / 1000 kg"),
        ]:
            self.out[key].set(fmt)

        r1 = self.PLANETS[origin]
        r2 = self.PLANETS[dest]
        th = np.linspace(0, 2*np.pi, 600)
        a = c["a"]

        # Fresh mission illustration: randomise the displayed starting orbital
        # phase for each generated challenge. The calculations remain unchanged.
        visual_rng = random.Random(getattr(self, "mission_visual_seed", 0))
        visual_phase = visual_rng.uniform(0, 2*np.pi)
        e = abs(r2-r1)/(r1+r2)
        p = a*(1-e*e)
        if r2 < r1:
            rr = p/(1-e*np.cos(th))
        else:
            rr = p/(1+e*np.cos(th))

        self.ax.clear()
        self.ax.set_facecolor(self.bg)

        # Each body's orbit and marker use the same representative color.
        origin_color = self.PLANET_COLORS.get(origin, "#4A90E2")
        dest_color = self.PLANET_COLORS.get(dest, "#C75C3C")

        x1, y1 = r1*np.cos(th), r1*np.sin(th)
        x2, y2 = r2*np.cos(th), r2*np.sin(th)

        # Exact Hohmann ellipse in polar form, with the Sun at one focus.
        # For an outer destination, Earth is periapsis (+x) and the destination
        # is apoapsis (-x). For an inner destination, Earth is apoapsis (+x)
        # and the destination is periapsis (-x).
        p = a * (1 - e**2)
        if r2 < r1:
            rr_plot = p / (1 - e*np.cos(th))
        else:
            rr_plot = p / (1 + e*np.cos(th))
        xt, yt = rr_plot*np.cos(th), rr_plot*np.sin(th)

        self.ax.plot(
            x1, y1,
            color=origin_color, linewidth=1.8, alpha=0.9,
            label=f"Órbita {origin}"
        )
        self.ax.plot(
            x2, y2,
            color=dest_color, linewidth=1.8, alpha=0.9,
            label=f"Órbita {dest}"
        )

        # Hohmann transfer is intentionally white so it stands out.
        self.ax.plot(
            xt, yt,
            "--", color="white", linewidth=2.2,
            label="Transferência Hohmann"
        )

        # Sun and planets.
        self.ax.scatter(
            [0], [0], s=180, color="gold",
            edgecolors="white", linewidths=0.8, zorder=5,
            label="Sol"
        )
        origin_xy = np.array([r1, 0.0])
        dest_xy = np.array([r2, 0.0])

        self.ax.scatter(
            [origin_xy[0]], [origin_xy[1]], s=75, color=origin_color,
            edgecolors="white", linewidths=0.8, zorder=6
        )
        self.ax.scatter(
            [dest_xy[0]], [dest_xy[1]], s=75, color=dest_color,
            edgecolors="white", linewidths=0.8, zorder=6
        )

        # Mark the transfer departure and arrival points on the Hohmann ellipse.
        if r2 < r1:
            transfer_departure = np.array([r1, 0.0])
            transfer_arrival = np.array([-r2, 0.0])
        else:
            transfer_departure = np.array([r1, 0.0])
            transfer_arrival = np.array([-r2, 0.0])
        self.ax.scatter(
            [transfer_departure[0]], [transfer_departure[1]], s=28,
            color="white", zorder=7
        )
        self.ax.scatter(
            [transfer_arrival[0]], [transfer_arrival[1]], s=28,
            color="white", zorder=7
        )
        lim = max(r1, r2) * 1.25
        self.ax.set_xlim(-lim, lim)
        self.ax.set_ylim(-lim, lim)
        self.ax.set_aspect("equal", adjustable="box")
        self.ax.set_xlabel("AU")
        self.ax.set_ylabel("AU")
        self.ax.set_title(f"{origin} → {dest}", color=self.text, fontsize=15)
        self.ax.tick_params(colors=self.muted)
        self.ax.legend(fontsize=8)
        self.fig.tight_layout()
        self.canvas.draw()

        if self.mode.get() == "ensino":
            self.explain.configure(
                text=f"1. Define r₁ e r₂\n"
                     f"2. Calcula o semi-eixo: a = (r₁ + r₂)/2\n"
                     f"3. Usa vis-viva para obter as velocidades\n"
                     f"4. Calcula Δv em cada manobra\n"
                     f"5. Calcula a energia cinética: Eₖ = ½mv²\n"
                     f"6. Calcula o tempo de transferência\n"
                     f"7. Calcula a velocidade angular n₂\n"
                     f"8. Calcula o ângulo de fase φ"
            )
            self.status.configure(
                text="Modo Ensino • calcula no papel e confirma no laboratório."
            )
        elif self.challenge:
            self.explain.configure(
                text=f"Desafio ativo: Terra → {self.challenge['dest']}\n"
                     f"Pontuação atual: {self.score}/100\n\n"
                     "A energia pedida corresponde à soma dos módulos das "
                     "variações de energia cinética nas duas manobras."
            )

# ------------------------------------------------------------
# START APPLICATION
# ------------------------------------------------------------
if __name__ == "__main__":
    root = tk.Tk()
    app = MarsMissionLab(root)
    root.mainloop()
