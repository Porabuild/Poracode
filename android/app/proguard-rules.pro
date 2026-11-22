# Poracode Android R8 / ProGuard keep rules

# Keep line numbers for crash diagnostics
-keepattributes SourceFile,LineNumberTable
-keepattributes *Annotation*,Signature,InnerClasses,EnclosingMethod

# kotlinx.serialization generated serializers & Companion.serializer()
-keep,includedescriptorclasses class com.poracode.app.**$$serializer { *; }
-keep,includedescriptorclasses class com.poracode.remote.v3.generated.**$$serializer { *; }
-keepclassmembers class com.poracode.app.** {
    *** Companion;
}
-keepclassmembers class com.poracode.remote.v3.generated.** {
    *** Companion;
}
-keepclasseswithmembers class com.poracode.app.** {
    kotlinx.serialization.KSerializer serializer(...);
}
-keepclasseswithmembers class com.poracode.remote.v3.generated.** {
    kotlinx.serialization.KSerializer serializer(...);
}

# Keep generated remote-v3 models, codecs, and state machines intact for wire fidelity
-keep class com.poracode.remote.v3.generated.** { *; }

# Keep versioned persisted local document models (settings, workspaces, custom themes, changelog)
-keep class com.poracode.app.storage.** { *; }
-keep class com.poracode.app.ui.theme.CustomTheme* { *; }
-keep class com.poracode.app.ui.theme.NativeCustomTheme* { *; }
-keep class com.poracode.app.ui.changelog.** { *; }

# Keep OkHttp / Haze / MLKit barcode reflection points safe
-dontwarn okhttp3.**
-dontwarn okio.**
-dontwarn org.conscrypt.**
-dontwarn org.bouncycastle.**
-dontwarn org.openjsse.**
