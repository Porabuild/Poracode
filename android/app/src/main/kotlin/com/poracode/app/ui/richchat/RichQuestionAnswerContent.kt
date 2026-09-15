package com.poracode.app.ui.richchat

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.poracode.app.ui.theme.LocalChatTextSizeSp

@Composable
internal fun RichQuestionAnswerContent(entries: List<RichQuestionAnswerEntry>) {
    val chatSize = LocalChatTextSizeSp.current
    SelectionContainer {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            entries.forEach { entry ->
                Column(verticalArrangement = Arrangement.spacedBy(5.dp)) {
                    if (entry.header.isNotBlank() && entry.header != entry.question) {
                        Text(entry.header, style = MaterialTheme.typography.labelMedium)
                    }
                    if (entry.question.isNotBlank()) {
                        Text(entry.question, fontSize = chatSize.sp, lineHeight = (chatSize + 6).sp)
                    }
                    entry.selected.forEach { selection ->
                        Row(horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                            Icon(Icons.Filled.Check, contentDescription = null)
                            Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                Text(selection.label, fontWeight = FontWeight.Medium, fontSize = chatSize.sp)
                                selection.description?.takeIf(String::isNotBlank)?.let {
                                    Text(it, style = MaterialTheme.typography.bodySmall)
                                }
                            }
                        }
                    }
                    entry.customAnswer?.let {
                        Text(it, fontSize = chatSize.sp, lineHeight = (chatSize + 6).sp)
                    }
                }
            }
        }
    }
}
