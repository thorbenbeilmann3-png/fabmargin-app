# APK direkt zum Download bereitstellen

Google verlangt für den Play Store eine **AAB**-Datei (nicht APK).
Wenn Sie Kunden zusätzlich einen **direkten APK-Download** anbieten wollen
(außerhalb des Play Stores), müssen Sie das explizit auszeichnen:

1. `assembleRelease` statt `bundleRelease` → erzeugt eine signierte APK.
2. Die APK auf Ihrer Website hosten und Kunden anweisen, in Android
   „Installation aus unbekannten Quellen" zu erlauben.
3. Achtung: In-App-Käufe funktionieren **nur** in der Play-Store-Version,
   nicht in der Sideload-APK (Google-Play-Billing-Beschränkung).

Empfehlung: **Play Store nutzen**, weil Kunden dort automatische Updates
und Käuferschutz erhalten.
