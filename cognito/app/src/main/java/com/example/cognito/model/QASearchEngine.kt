package com.example.cognito.model

import android.content.Context
import com.example.cognito.util.DocumentStore
import com.example.cognito.util.ScannedDocument
import org.tensorflow.lite.task.text.qa.BertQuestionAnswerer
import org.tensorflow.lite.task.text.qa.QaAnswer
import java.io.File
import java.io.IOException

data class QAAnswerResult(
    val answer: String,
    val sourceDocumentName: String,
    val sourceDocumentPath: String,
    val score: Float,
    val contextSnippet: String
)

object QASearchEngine {

    private var answerer: BertQuestionAnswerer? = null
    private const val MODEL_NAME = "mobilebert_qa.tflite"

    // Context memory for follow-up "more information" requests
    var lastResult: QAAnswerResult? = null

    fun init(context: Context): Boolean {
        if (answerer != null) return true
        
        return try {
            val options = BertQuestionAnswerer.BertQuestionAnswererOptions.builder().build()
            // Try loading from assets
            answerer = BertQuestionAnswerer.createFromFileAndOptions(
                context, 
                MODEL_NAME, 
                options
            )
            true
        } catch (e: IOException) {
            e.printStackTrace()
            false
        }
    }

    // Main QA pipeline: 1. Retrieval (find context), 2. Inference (run TFLite model)
    fun askQuestion(context: Context, question: String): QAAnswerResult? {
        // Ensure model is loaded
        val isInitialized = init(context)
        if (!isInitialized || answerer == null) {
            return QAAnswerResult(
                answer = "Local AI model is still loading or could not be found in Assets. Please check setup.",
                sourceDocumentName = "System Error",
                sourceDocumentPath = "",
                score = 0.0f,
                contextSnippet = ""
            )
        }

        val docs = DocumentStore.documents
        if (docs.isEmpty()) {
            return QAAnswerResult(
                answer = "No local files have been scanned yet! Please scan files first.",
                sourceDocumentName = "System Info",
                sourceDocumentPath = "",
                score = 0.0f,
                contextSnippet = ""
            )
        }

        // 0. Conversational Follow-up Check
        val cleanQuestion = question.trim().lowercase()
        val isFollowUp = cleanQuestion in setOf(
            "give more information", "more information", "more info", "more", 
            "continue", "say more", "tell me more", "explain more", "give details", "details"
        )

        if (isFollowUp && lastResult != null) {
            val prevResult = lastResult!!
            val prevDoc = docs.firstOrNull { it.path == prevResult.sourceDocumentPath }
            if (prevDoc != null) {
                val fullContent = prevDoc.content
                val prevSnippet = prevResult.contextSnippet
                val index = fullContent.indexOf(prevSnippet)
                
                // Extract broad surrounding content around the last found answer
                val moreInfoText = if (index != -1) {
                    val start = Math.max(0, index - 200)
                    val end = Math.min(fullContent.length, index + prevSnippet.length + 400)
                    fullContent.substring(start, end).trim()
                } else {
                    fullContent.take(800)
                }

                return QAAnswerResult(
                    answer = moreInfoText,
                    sourceDocumentName = prevResult.sourceDocumentName,
                    sourceDocumentPath = prevResult.sourceDocumentPath,
                    score = 10.0f,
                    contextSnippet = prevSnippet
                )
            }
        }

        // 1. Context Retrieval (finding the best matching chunk across all documents)
        val bestChunkMatch = retrieveBestContextChunk(docs, question)
        if (bestChunkMatch == null) {
            return QAAnswerResult(
                answer = "No document matches your search terms. Try widening your query.",
                sourceDocumentName = "Search Results",
                sourceDocumentPath = "",
                score = 0.0f,
                contextSnippet = ""
            )
        }

        val (retrievedContext, sourceDoc) = bestChunkMatch

        // 2. Local AI Inference
        val finalResult = try {
            val answers: List<QaAnswer> = answerer!!.answer(retrievedContext, question)
            val bestAnswer = answers.firstOrNull()
            
            if (bestAnswer != null && bestAnswer.text.isNotBlank()) {
                QAAnswerResult(
                    answer = bestAnswer.text.trim(),
                    sourceDocumentName = sourceDoc.name,
                    sourceDocumentPath = sourceDoc.path,
                    score = bestAnswer.pos.logit,
                    contextSnippet = retrievedContext
                )
            } else {
                // If model extracts empty text, fallback to showing the best context paragraph snippet
                QAAnswerResult(
                    answer = retrievedContext.trim(),
                    sourceDocumentName = sourceDoc.name,
                    sourceDocumentPath = sourceDoc.path,
                    score = 0.0f,
                    contextSnippet = retrievedContext
                )
            }
        } catch (e: Exception) {
            e.printStackTrace()
            QAAnswerResult(
                answer = "Error running local AI model: ${e.message}",
                sourceDocumentName = sourceDoc.name,
                sourceDocumentPath = sourceDoc.path,
                score = 0.0f,
                contextSnippet = retrievedContext
            )
        }

        // Cache last result if it's a valid extracted answer
        if (finalResult.answer.isNotBlank() && finalResult.answer != "Answer not found.") {
            lastResult = finalResult
        }

        return finalResult
    }

    private fun retrieveBestContextChunk(
        docs: List<ScannedDocument>, 
        query: String
    ): Pair<String, ScannedDocument>? {
        val stopWords = setOf(
            "the", "what", "who", "whom", "which", "where", "when", "why", "how", 
            "this", "that", "these", "those", "and", "but", "for", "are", "was", 
            "were", "been", "has", "have", "had", "does", "did", "not", "out", 
            "from", "with", "about", "into", "their", "them", "then", "there", 
            "they", "your", "its", "his", "her", "she", "him", "you", "our"
        )

        val queryTerms = query.lowercase()
            .split(Regex("\\W+"))
            .map { it.trim() }
            .filter { it.length > 2 && !stopWords.contains(it) }
            .map { 
                var t = it
                if (t.endsWith("'s")) t = t.substring(0, t.length - 2)
                if (t.endsWith("s") && t.length > 3 && !t.endsWith("ss")) t = t.substring(0, t.length - 1)
                t
            }
            .filter { it.isNotBlank() }
            
        if (queryTerms.isEmpty()) {
            val fallbackTerms = query.lowercase().split(Regex("\\W+")).filter { it.length > 2 }
            if (fallbackTerms.isEmpty()) {
                val doc = docs.first()
                val chunk = doc.content.split("\n").firstOrNull { it.isNotBlank() } ?: doc.content.take(300)
                return Pair(chunk, doc)
            }
        }

        val finalTerms = if (queryTerms.isNotEmpty()) queryTerms else query.lowercase().split(Regex("\\W+")).filter { it.length > 2 }

        var bestScore = 0.0f
        var bestChunk = ""
        var bestDoc: ScannedDocument? = null

        for (doc in docs) {
            // Split document into larger chunks of ~1000 characters overlapping by 300 characters
            // to ensure name and marks/details aren't separated across chunk borders.
            val chunks = chunkText(doc.content, 1000, 300)
            
            for (chunk in chunks) {
                var score = 0.0f
                val chunkLower = chunk.lowercase()
                
                // Score based on term frequencies and term occurrences
                for (term in finalTerms) {
                    if (chunkLower.contains(term)) {
                        val count = countOccurrences(chunkLower, term)
                        score += 1.0f + (count * 0.2f) // Increased weight for term density
                    }
                }
                
                // Boost score if filename matches query terms (highly indicative of source file)
                val filenameLower = doc.name.lowercase()
                for (term in finalTerms) {
                    if (filenameLower.contains(term)) {
                        score += 3.0f // Heavy filename boost
                    }
                }

                if (score > bestScore) {
                    bestScore = score
                    bestChunk = chunk
                    bestDoc = doc
                }
            }
        }

        return if (bestDoc != null && bestScore > 0.0f) {
            Pair(bestChunk, bestDoc)
        } else {
            // Default fallback if no keywords match but files exist
            val doc = docs.first()
            val fallback = doc.content.take(600)
            Pair(fallback, doc)
        }
    }

    private fun chunkText(text: String, chunkSize: Int, overlap: Int): List<String> {
        val chunks = mutableListOf<String>()
        if (text.length <= chunkSize) {
            chunks.add(text)
            return chunks
        }

        var start = 0
        while (start < text.length) {
            val end = Math.min(start + chunkSize, text.length)
            chunks.add(text.substring(start, end))
            start += chunkSize - overlap
        }
        return chunks
    }

    private fun countOccurrences(text: String, sub: String): Int {
        var count = 0
        var idx = 0
        while (true) {
            idx = text.indexOf(sub, idx)
            if (idx == -1) break
            count++
            idx += sub.length
        }
        return count
    }
}
