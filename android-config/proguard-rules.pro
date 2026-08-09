# FabMargin 3D - ProGuard/R8 Regeln
# Diese Datei wird nach `npx cap add android` unter
# android/app/proguard-rules.pro kopiert und aktiviert die
# Code-Verschleierung fuer den Release-Build.

# Capacitor Kern schuetzen
-keep class com.getcapacitor.** { *; }
-keep class com.printprofit3d.fabmargin.** { *; }

# WebView-Bruecken erhalten
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Alles andere aggressiv verschleiern
-repackageclasses ''
-allowaccessmodification
-optimizations !code/simplification/arithmetic
-optimizationpasses 5
-dontpreverify
-verbose

# Reflection-sichere Modelle
-keepattributes Signature, *Annotation*, EnclosingMethod, InnerClasses
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute FabMargin
