package com.example.cognito.util

import android.content.Context
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.userProfileChangeRequest

data class UserData(
    val uid: String,
    val email: String,
    val displayName: String,
    val isAnonymous: Boolean
)

object AuthManager {

    var currentUser by mutableStateOf<UserData?>(null)
    var isInitialized by mutableStateOf(false)
    private var firebaseAuth: FirebaseAuth? = null

    fun init(context: Context) {
        if (isInitialized) return
        try {
            firebaseAuth = FirebaseAuth.getInstance()
            firebaseAuth?.addAuthStateListener { auth ->
                val user = auth.currentUser
                if (user != null) {
                    currentUser = UserData(
                        uid = user.uid,
                        email = user.email ?: if (user.isAnonymous) "Guest User" else "user@cognito.ai",
                        displayName = user.displayName ?: user.email?.substringBefore("@") ?: "Cognito User",
                        isAnonymous = user.isAnonymous
                    )
                } else {
                    currentUser = null
                }
            }
        } catch (e: Exception) {
            // Firebase not yet configured with google-services.json; local fallback mode
            e.printStackTrace()
            firebaseAuth = null
        }
        isInitialized = true
    }

    fun signInWithEmail(email: String, password: String, onResult: (Boolean, String?) -> Unit) {
        val trimmedEmail = email.trim()
        if (trimmedEmail.isEmpty() || password.isEmpty()) {
            onResult(false, "Please enter both email and password.")
            return
        }

        val auth = firebaseAuth
        if (auth != null) {
            auth.signInWithEmailAndPassword(trimmedEmail, password)
                .addOnSuccessListener { result ->
                    val user = result.user
                    currentUser = UserData(
                        uid = user?.uid ?: "usr_${System.currentTimeMillis()}",
                        email = user?.email ?: trimmedEmail,
                        displayName = user?.displayName ?: trimmedEmail.substringBefore("@"),
                        isAnonymous = false
                    )
                    onResult(true, null)
                }
                .addOnFailureListener { exception ->
                    onResult(false, exception.localizedMessage ?: "Sign in failed.")
                }
        } else {
            // Offline demo fallback sign in
            currentUser = UserData(
                uid = "usr_${Math.abs(trimmedEmail.hashCode())}",
                email = trimmedEmail,
                displayName = trimmedEmail.substringBefore("@"),
                isAnonymous = false
            )
            onResult(true, null)
        }
    }

    fun signUpWithEmail(email: String, password: String, name: String, onResult: (Boolean, String?) -> Unit) {
        val trimmedEmail = email.trim()
        if (trimmedEmail.isEmpty() || password.length < 6) {
            onResult(false, "Password must be at least 6 characters long.")
            return
        }

        val auth = firebaseAuth
        if (auth != null) {
            auth.createUserWithEmailAndPassword(trimmedEmail, password)
                .addOnSuccessListener { result ->
                    val user = result.user
                    if (name.isNotBlank() && user != null) {
                        val profileUpdates = userProfileChangeRequest {
                            displayName = name.trim()
                        }
                        user.updateProfile(profileUpdates)
                    }
                    currentUser = UserData(
                        uid = user?.uid ?: "usr_${System.currentTimeMillis()}",
                        email = user?.email ?: trimmedEmail,
                        displayName = if (name.isNotBlank()) name.trim() else trimmedEmail.substringBefore("@"),
                        isAnonymous = false
                    )
                    onResult(true, null)
                }
                .addOnFailureListener { exception ->
                    onResult(false, exception.localizedMessage ?: "Registration failed.")
                }
        } else {
            // Offline demo fallback registration
            currentUser = UserData(
                uid = "usr_${System.currentTimeMillis()}",
                email = trimmedEmail,
                displayName = if (name.isNotBlank()) name.trim() else trimmedEmail.substringBefore("@"),
                isAnonymous = false
            )
            onResult(true, null)
        }
    }

    fun signInAnonymously(onResult: (Boolean, String?) -> Unit) {
        val auth = firebaseAuth
        if (auth != null) {
            auth.signInAnonymously()
                .addOnSuccessListener { result ->
                    val user = result.user
                    currentUser = UserData(
                        uid = user?.uid ?: "guest_${System.currentTimeMillis()}",
                        email = "guest@cognito.local",
                        displayName = "Guest User",
                        isAnonymous = true
                    )
                    onResult(true, null)
                }
                .addOnFailureListener { exception ->
                    onResult(false, exception.localizedMessage ?: "Guest login failed.")
                }
        } else {
            currentUser = UserData(
                uid = "guest_${System.currentTimeMillis()}",
                email = "guest@cognito.local",
                displayName = "Guest User",
                isAnonymous = true
            )
            onResult(true, null)
        }
    }

    fun signOut() {
        try {
            firebaseAuth?.signOut()
        } catch (e: Exception) {
            e.printStackTrace()
        }
        currentUser = null
    }
}
