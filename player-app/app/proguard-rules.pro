# Keep Socket.IO classes
-keep class io.socket.** { *; }
-keep class org.json.** { *; }

# Keep Retrofit
-keep class retrofit2.** { *; }
-keepattributes Signature
-keepattributes Exceptions

# Keep model classes
-keep class com.pokernight.player.data.model.** { *; }

# Keep Compose Navigation
-keep class androidx.navigation.** { *; }
-keep class * extends androidx.navigation.NavController { *; }
-keep class * extends androidx.navigation.NavHost { *; }

# Keep Compose runtime
-keep class androidx.compose.** { *; }
-keepclassmembers class * {
    @androidx.compose.runtime.* <methods>;
}

# Keep ViewModel
-keep class * extends androidx.lifecycle.ViewModel { *; }
-keep class * extends androidx.lifecycle.ViewModelProvider { *; }
