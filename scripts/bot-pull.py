#!/usr/bin/env python3
"""
Le pont entre le journal et le bot d'exécution.

Le bot tourne sur la machine du trader, derrière sa box : le serveur ne peut
pas l'appeler, donc c'est lui qui interroge le journal. Il demande les ordres
à poser et ceux à retirer, les exécute, puis accuse réception — et c'est cet
accusé qui marque la ligne dans Ordres du jour et déclenche la notification
sur le téléphone.

À faire :

  1. poser les deux variables d'environnement :

       export JOURNAL_URL=https://…up.railway.app
       export BOT_API_KEY=…            # la même que sur Railway

  2. lancer :  python3 scripts/bot-pull.py

Rien d'autre à configurer. Les deux listes sont vides la plupart du temps,
donc interroger toutes les vingt secondes ne coûte rien.

Ce que le bot VolFix reçoit : une ligne « 6B LONG » dans ~/volfix-bot/signal.txt,
et rien d'autre. Il n'a donc ni l'entrée, ni le SL, ni les TP que le journal a
calculés — il charge son template et clique le prix à une position fixe de
l'échelle.

Le journal n'est prévenu qu'une fois le fichier vidé par bot.py, ce qu'il fait
après avoir cliqué : c'est la seule preuve qu'il a lu le signal. Ça ne prouve
pas que l'ordre existe chez le courtier — pour ça il faut regarder VolFix.
"""

from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.request

# Le fichier que le bot VolFix surveille. Une ligne : « 6B LONG ».
FICHIER_SIGNAL = os.path.expanduser("~/volfix-bot/signal.txt")

JOURNAL = os.environ.get("JOURNAL_URL", "").rstrip("/")
CLE = os.environ.get("BOT_API_KEY", "")
PERIODE = 20  # secondes entre deux interrogations
DELAI = 10  # secondes avant d'abandonner un appel
# Le temps laissé au bot : son execute_trade fait huit à dix secondes de clics,
# et il ne vide le fichier qu'après.
ATTENTE_AVANT = 60.0  # pour qu'il finisse le signal précédent
ATTENTE_APRES = 45.0  # pour qu'il lise le nôtre

if not JOURNAL or not CLE:
    sys.exit("Il manque JOURNAL_URL ou BOT_API_KEY.")

ENTETES = {"X-Bot-Key": CLE, "Content-Type": "application/json"}


class JournalInjoignable(Exception):
    """Réseau coupé, serveur en redéploiement, clé refusée."""


def appel(chemin: str, corps: dict | None = None) -> dict:
    """Un appel au journal, avec la bibliothèque standard seule.

    Pas de `requests` : ce script tourne sur le Python qui fait marcher
    pyautogui, et lui demander d'installer un paquet de plus est une panne en
    puissance. `urllib` suffit pour deux appels.
    """
    donnees = json.dumps(corps).encode() if corps is not None else None
    req = urllib.request.Request(f"{JOURNAL}{chemin}", data=donnees, headers=ENTETES, method="POST" if corps is not None else "GET")
    try:
        with urllib.request.urlopen(req, timeout=DELAI) as r:
            return json.loads(r.read() or "{}")
    except urllib.error.HTTPError as e:
        detail = ""
        try:
            detail = json.loads(e.read() or "{}").get("error", "")
        except Exception:  # noqa: BLE001 — un corps illisible ne doit pas masquer le code
            pass
        raise JournalInjoignable(f"HTTP {e.code}{f' : {detail}' if detail else ''}") from e
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        raise JournalInjoignable(str(e)) from e


def fichier_vide() -> bool:
    """Le bot a-t-il fini de traiter le signal précédent ?

    bot.py vide le fichier une fois `execute_trade` terminé, soit huit à dix
    secondes de clics après l'avoir lu. Un fichier vide est donc la seule
    preuve disponible qu'il a bien consommé le signal — on s'en sert comme
    poignée de main dans les deux sens.
    """
    try:
        with open(FICHIER_SIGNAL) as f:
            return not f.read().strip()
    except FileNotFoundError:
        return True


def attendre_vide(limite: float) -> bool:
    """Attend que le bot ait consommé, au plus `limite` secondes."""
    fin = time.time() + limite
    while time.time() < fin:
        if fichier_vide():
            return True
        time.sleep(0.5)
    return fichier_vide()


def send_signal_to_bot(market: str, side: str) -> None:
    """Dépose le signal que le bot VolFix surveille.

    Le bot lit une ligne — « 6B LONG » — et agit. Il n'a pas besoin des prix :
    il charge son propre template de T/P et S/L, et clique le prix à une
    position fixe de l'échelle. Le journal, lui, a calculé une entrée, un SL
    et deux TP précis : les deux ne décrivent pas forcément le même trade.
    """
    os.makedirs(os.path.dirname(FICHIER_SIGNAL), exist_ok=True)
    with open(FICHIER_SIGNAL, "w") as f:
        f.write(f"{market.upper()} {side.upper()}")
    print(f"Signal envoyé: {market} {side}")


def passer_ordre(o: dict) -> None:
    """Un ordre du journal devient un signal pour VolFix.

    Deux attentes encadrent l'écriture, parce que le fichier ne tient qu'un
    signal à la fois :

      - avant, que le précédent soit consommé — sinon on l'écraserait, et le
        bot effacerait le nôtre en finissant le sien ;
      - après, que le bot ait vidé le fichier — c'est ce qui prouve qu'il a
        lu, et seulement alors le journal est prévenu.

    Sans cette seconde attente, le journal afficherait « posé » pour un signal
    que le bot n'a peut-être jamais vu : fichier oublié, bot arrêté, VolFix
    fermé.
    """
    if not attendre_vide(ATTENTE_AVANT):
        raise RuntimeError(f"Le signal précédent n'est pas consommé après {ATTENTE_AVANT:.0f} s — bot arrêté ou bloqué ?")
    send_signal_to_bot(o["symbol"], "LONG" if o["side"] == "long" else "SHORT")
    if not attendre_vide(ATTENTE_APRES):
        raise RuntimeError(f"Le bot n'a pas lu le signal en {ATTENTE_APRES:.0f} s — vérifie qu'il tourne et que VolFix est ouvert")


def retirer_ordre(o: dict) -> None:
    """Le retrait d'un ordre, que le protocole du fichier ne sait pas exprimer.

    Un signal dit d'entrer, jamais d'annuler. Plutôt que d'accuser un retrait
    qui n'a pas eu lieu — ce qui laisserait un ordre dormir chez le courtier
    pendant que le journal l'affiche comme retiré —, on remonte l'échec : la
    ligne passe au rouge dans Ordres du jour avec ce message.
    """
    raise RuntimeError(f"Le bot VolFix ne sait pas annuler : retire {o['symbol']} {o['side']} à la main ({o['raison']})")


def accuser(ordre_id: str, fait: str, erreur: str | None = None) -> None:
    """Dit au journal ce qui s'est passé. Un échec est écrit sur la ligne."""
    corps: dict = {"fait": fait}
    if erreur:
        corps["erreur"] = erreur[:300]
    appel(f"/api/bot/orders/{ordre_id}", corps)


def un_tour() -> None:
    travail = appel("/api/bot/orders")

    for o in travail["aPoser"]:
        try:
            passer_ordre(o)
        except Exception as e:  # noqa: BLE001 — tout échec doit remonter au journal
            accuser(o["id"], "pose", f"{type(e).__name__}: {e}")
        else:
            accuser(o["id"], "pose")

    for o in travail["aRetirer"]:
        try:
            retirer_ordre(o)
        except Exception as e:  # noqa: BLE001
            accuser(o["id"], "retrait", f"{type(e).__name__}: {e}")
        else:
            accuser(o["id"], "retrait")


def main() -> None:
    print(f"Bot relié à {JOURNAL}, interrogation toutes les {PERIODE} s. Ctrl-C pour arrêter.")
    while True:
        try:
            un_tour()
        except JournalInjoignable as e:
            # Réseau coupé, serveur en redéploiement : on réessaiera au tour
            # suivant. Rien n'est perdu — le journal garde le travail à faire
            # jusqu'à ce qu'un accusé arrive.
            print(f"[{time.strftime('%H:%M:%S')}] journal injoignable : {e}")
        time.sleep(PERIODE)


if __name__ == "__main__":
    main()
